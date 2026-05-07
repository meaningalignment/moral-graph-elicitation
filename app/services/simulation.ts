import path from "node:path"
import { db, inngest } from "~/config.server"
import {
  createRunContext,
  ensureSimulatedUser,
  simulatePersonaArticulation,
  castSimulatedEdgeVotes,
} from "../../simulation/runner"
import { loadPersonas, Persona } from "../../simulation/personas/schema"

function selectPersonas(all: Persona[], spec: string): Persona[] {
  const trimmed = spec.trim()
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed)
    return all.slice(0, Math.min(n, all.length))
  }
  const slugs = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return slugs
    .map((s) => all.find((p) => p.slug === s || p.name === s))
    .filter((p): p is Persona => !!p)
}

/**
 * Simulate-driven deliberation seeding.
 *
 * 1. Run each persona through articulation (and optionally voting).
 * 2. Run dedup so newly-created ValuesCards become CanonicalValuesCards.
 * 3. Run hypothesize so transition stories appear on the moral graph.
 * 4. Reset setupStatus to "ready" (or revert it on failure).
 *
 * This replaces the old gen-seed-graph path: the old one made synthetic
 * orphan cards and then ran the same dedup/hypothesize chain. The simulator
 * does the same thing but with traceable persona-driven chats.
 */
export const simulateDeliberation = inngest.createFunction(
  { id: "simulate-deliberation", concurrency: 2 },
  { event: "simulate-deliberation" },
  async ({ event, step, logger }) => {
    const deliberationId = Number(event.data.deliberationId)
    const personasSpec = String(event.data.personas ?? "4")
    const articulateOnly = Boolean(event.data.articulateOnly)
    const voteLimit = event.data.voteLimit
      ? Number(event.data.voteLimit)
      : undefined
    const skipDedupHypothesize = Boolean(event.data.skipDedupHypothesize)

    const all = loadPersonas(
      path.join(process.cwd(), "simulation", "personas")
    )
    const personas = selectPersonas(all, personasSpec)
    if (personas.length === 0) {
      logger.warn(`No personas matched spec '${personasSpec}'`)
      return { message: "no personas matched" }
    }

    // Track previous status so we can revert it if the simulation crashes.
    const previousStatus = await step.run(
      `mark setupStatus=generating_graph for ${deliberationId}`,
      async () => {
        const d = await db.deliberation.findUniqueOrThrow({
          where: { id: deliberationId },
        })
        await db.deliberation.update({
          where: { id: deliberationId },
          data: { setupStatus: "generating_graph" },
        })
        return d.setupStatus
      }
    )

    const ctx = createRunContext()
    logger.info(
      `Simulation run ${ctx.runId} on deliberation ${deliberationId} with ${personas.length} personas`
    )

    const summary: any[] = []
    let crashed = false
    for (const persona of personas) {
      const row: any = { persona: persona.slug }
      try {
        const user = await step.run(
          `ensure user for ${persona.slug}`,
          async () => ensureSimulatedUser(persona)
        )
        row.userId = user.id

        const articulation = await step.run(
          `articulate ${persona.slug}`,
          async () =>
            simulatePersonaArticulation({
              persona,
              deliberationId,
              ctx,
            })
        )
        Object.assign(row, articulation)

        if (!articulateOnly) {
          const voted = await step.run(
            `vote ${persona.slug}`,
            async () =>
              castSimulatedEdgeVotes({
                persona,
                deliberationId,
                ctx,
                limit: voteLimit,
              })
          )
          Object.assign(row, voted)
        }
      } catch (e: any) {
        row.error = e.message
        crashed = true
        logger.error(`Persona ${persona.slug} failed: ${e.message}`)
      }
      summary.push(row)
    }

    // Chain dedup + hypothesize so the moral graph is fully populated.
    // Time-bounded: if either stage hangs we still reset setupStatus below.
    if (!skipDedupHypothesize) {
      try {
        await step.sendEvent("trigger-dedup", {
          name: "deduplicate",
          data: { deliberationId },
        })
        await step.waitForEvent("await-dedup-finished", {
          event: "deduplicate-finished",
          timeout: "10m",
          match: "data.deliberationId",
        })
      } catch (e: any) {
        logger.error(`dedup chain failed/timed out: ${e.message}`)
      }
      try {
        await step.sendEvent("trigger-hypothesize", {
          name: "hypothesize",
          data: { deliberationId },
        })
        await step.waitForEvent("await-hypothesize-finished", {
          event: "hypothesize-finished",
          timeout: "10m",
          match: "data.deliberationId",
        })
      } catch (e: any) {
        logger.error(`hypothesize chain failed/timed out: ${e.message}`)
      }
    }

    // Always restore a sensible setupStatus so the deliberation never gets
    // stuck (this is the bug that left deliberation 34 in generating_graph).
    await step.run("reset setupStatus", async () =>
      db.deliberation.update({
        where: { id: deliberationId },
        data: { setupStatus: "ready" },
      })
    )

    return {
      runId: ctx.runId,
      summary,
      crashed,
      previousStatus,
    }
  }
)
