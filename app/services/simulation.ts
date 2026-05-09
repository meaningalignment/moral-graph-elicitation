import path from "node:path"
import { kv } from "@vercel/kv"
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

function resolvePersonas(args: {
  inlinePersonas?: Persona[]
  spec?: string
  diskDir: string
}): Persona[] {
  // Inline personas (sent from the dashboard dialog) win — they may include
  // ad-hoc generated ones not on disk.
  if (args.inlinePersonas && args.inlinePersonas.length) {
    return args.inlinePersonas
  }
  const all = loadPersonas(args.diskDir)
  return selectPersonas(all, args.spec ?? "6")
}

export type SimulationStage =
  | "starting"
  | "articulating"
  | "deduping"
  | "hypothesizing"
  | "voting"
  | "done"
  | "failed"

export type SimulationProgress = {
  stage: SimulationStage
  /** "stage X of N" — N is fixed at 5 (start, articulate, dedup, hypothesize, vote). */
  stageIndex: number
  stageCount: number
  /** Total personas in this run. */
  personasTotal: number
  /** Personas that have completed articulation so far. */
  personasArticulated: number
  /** Personas that have completed voting so far. */
  personasVoted: number
  /** UNIX ms timestamp when the run started. */
  startedAt: number
  /** Rough estimate of total seconds; used for progress bars. */
  estimatedSeconds: number
  /** Last log line. */
  message: string
  runId: string
}

const STAGE_INDEX: Record<SimulationStage, number> = {
  starting: 0,
  articulating: 1,
  deduping: 2,
  hypothesizing: 3,
  voting: 4,
  done: 5,
  failed: 5,
}

export const progressKey = (deliberationId: number) =>
  `simulation:${deliberationId}:progress`

async function writeProgress(
  deliberationId: number,
  patch: Partial<SimulationProgress> & { stage: SimulationStage; message: string }
) {
  // KV is best-effort progress reporting only. If it's down or rate-limited,
  // don't fail the whole Inngest step (which would otherwise retry the
  // simulation and waste LLM credits).
  let existing: SimulationProgress | null = null
  try {
    existing = (await kv.get<SimulationProgress>(progressKey(deliberationId))) ?? null
  } catch (e) {
    console.warn("KV get failed (non-fatal):", (e as Error).message)
  }
  const base: SimulationProgress = existing ?? {
    stage: "starting",
    stageIndex: 0,
    stageCount: 5,
    personasTotal: 0,
    personasArticulated: 0,
    personasVoted: 0,
    startedAt: Date.now(),
    estimatedSeconds: 300,
    message: "starting",
    runId: "",
  }
  const next: SimulationProgress = {
    ...base,
    ...patch,
    stageIndex: STAGE_INDEX[patch.stage],
  }
  // 1h TTL so stale progress doesn't haunt later runs
  try {
    await kv.set(progressKey(deliberationId), JSON.stringify(next), { ex: 3600 })
  } catch (e) {
    console.warn("KV set failed (non-fatal):", (e as Error).message)
  }
  return next
}

/**
 * Simulate-driven deliberation seeding. Stages (in order):
 *
 *   1. articulate — every persona produces a ValuesCard via the same
 *      articulation prompt the human chat UI uses.
 *   2. dedup      — group ValuesCards into CanonicalValuesCards.
 *   3. hypothesize — generate EdgeHypothesis stories on top of canonicals.
 *   4. vote        — every persona votes on the freshly-created
 *      EdgeHypothesis rows (this MUST happen after hypothesize, otherwise
 *      there's nothing to vote on).
 *
 * Progress for each stage is published to Vercel KV under
 * `simulation:<deliberationId>:progress` so the dashboard can render a
 * stage label + progress bar without a long-poll on Inngest itself.
 *
 * setupStatus is reset to "ready" unconditionally at the end so a stuck
 * run can never wedge a deliberation again.
 */
export const simulateDeliberation = inngest.createFunction(
  {
    id: "simulate-deliberation",
    concurrency: 2,
    triggers: { event: "simulate-deliberation" },
  },
  async ({ event, step, logger }) => {
    const deliberationId = Number(event.data.deliberationId)
    const personasSpec = String(event.data.personas ?? "4")
    const articulateOnly = Boolean(event.data.articulateOnly)
    const voteLimit = event.data.voteLimit
      ? Number(event.data.voteLimit)
      : undefined

    const personas = resolvePersonas({
      inlinePersonas: event.data.inlinePersonas as Persona[] | undefined,
      spec: personasSpec,
      diskDir: path.join(process.cwd(), "simulation", "personas"),
    })
    if (personas.length === 0) {
      logger.warn(`No personas matched`)
      return { message: "no personas matched" }
    }

    const ctx = createRunContext()
    const startedAt = Date.now()
    // Rough budget: ~45s/persona articulation, ~60s dedup, ~90s hypothesize,
    // ~30s/persona voting, plus a fudge factor.
    const estimatedSeconds =
      personas.length * 45 + 60 + 90 + (articulateOnly ? 0 : personas.length * 30) + 30

    await step.run("init progress", async () =>
      writeProgress(deliberationId, {
        stage: "starting",
        message: `Queued — ${personas.length} personas`,
        personasTotal: personas.length,
        personasArticulated: 0,
        personasVoted: 0,
        startedAt,
        estimatedSeconds,
        runId: ctx.runId,
      })
    )

    await step.run(
      `mark setupStatus=generating_graph for ${deliberationId}`,
      async () => {
        await db.deliberation.update({
          where: { id: deliberationId },
          data: { setupStatus: "generating_graph" },
        })
      }
    )

    const summary: any[] = []
    const userIds = new Map<string, number>()

    // Stage 1: articulate
    await step.run("progress: articulating", async () =>
      writeProgress(deliberationId, {
        stage: "articulating",
        message: `Personas articulating values (0/${personas.length})`,
      })
    )
    for (let i = 0; i < personas.length; i++) {
      const persona = personas[i]
      const row: any = { persona: persona.slug }
      try {
        const user = await step.run(
          `ensure user for ${persona.slug}`,
          async () => ensureSimulatedUser(persona)
        )
        row.userId = user.id
        userIds.set(persona.slug, user.id)

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
      } catch (e: any) {
        row.error = e.message
        logger.error(`Persona ${persona.slug} articulation failed: ${e.message}`)
      }
      summary.push(row)
      await step.run(`progress: articulated ${i + 1}`, async () =>
        writeProgress(deliberationId, {
          stage: "articulating",
          message: `Personas articulating values (${i + 1}/${personas.length})`,
          personasArticulated: i + 1,
        })
      )
    }

    // Stage 2: dedup
    await step.run("progress: deduping", async () =>
      writeProgress(deliberationId, {
        stage: "deduping",
        message: "Clustering values into canonical cards…",
      })
    )
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

    // Stage 3: hypothesize
    await step.run("progress: hypothesizing", async () =>
      writeProgress(deliberationId, {
        stage: "hypothesizing",
        message: "Generating transition stories between values…",
      })
    )
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

    // Stage 4: vote — only now do EdgeHypothesis rows exist to vote on.
    if (!articulateOnly) {
      await step.run("progress: voting", async () =>
        writeProgress(deliberationId, {
          stage: "voting",
          message: `Personas voting on transitions (0/${personas.length})`,
        })
      )
      for (let i = 0; i < personas.length; i++) {
        const persona = personas[i]
        try {
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
          Object.assign(
            summary.find((s) => s.persona === persona.slug) ?? {},
            voted
          )
        } catch (e: any) {
          logger.error(`Persona ${persona.slug} voting failed: ${e.message}`)
        }
        await step.run(`progress: voted ${i + 1}`, async () =>
          writeProgress(deliberationId, {
            stage: "voting",
            message: `Personas voting on transitions (${i + 1}/${personas.length})`,
            personasVoted: i + 1,
          })
        )
      }
    }

    // Always reset setupStatus and mark done.
    await step.run("reset setupStatus", async () =>
      db.deliberation.update({
        where: { id: deliberationId },
        data: { setupStatus: "ready" },
      })
    )
    await step.run("progress: done", async () =>
      writeProgress(deliberationId, {
        stage: "done",
        message: "Simulation complete",
      })
    )

    return { runId: ctx.runId, summary }
  }
)
