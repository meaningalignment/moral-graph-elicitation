import path from "node:path"
import { inngest } from "~/config.server"
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

    const all = loadPersonas(
      path.join(process.cwd(), "simulation", "personas")
    )
    const personas = selectPersonas(all, personasSpec)
    if (personas.length === 0) {
      logger.warn(`No personas matched spec '${personasSpec}'`)
      return { message: "no personas matched" }
    }

    const ctx = createRunContext()
    logger.info(
      `Simulation run ${ctx.runId} on deliberation ${deliberationId} with ${personas.length} personas`
    )

    const summary: any[] = []
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
        logger.error(`Persona ${persona.slug} failed: ${e.message}`)
      }
      summary.push(row)
    }

    return { runId: ctx.runId, summary }
  }
)
