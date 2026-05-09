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
  /** Set when stage === "failed". Surfaced to the dashboard so admins see why. */
  error?: string
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

    // Always publish a "starting" state immediately so the UI shows something.
    // Done before resolvePersonas/createRunContext, both of which can throw.
    const startedAt = Date.now()
    await step.run("init progress (queued)", async () =>
      writeProgress(deliberationId, {
        stage: "starting",
        message: "Starting simulation…",
        personasTotal: 0,
        personasArticulated: 0,
        personasVoted: 0,
        startedAt,
        estimatedSeconds: 60,
        runId: "",
      })
    )

    const failAndRethrow = async (e: unknown, where: string) => {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error(`Simulation failed in ${where}: ${msg}`)
      // Best-effort: clear setupStatus + write failure to KV so the UI sees it.
      try {
        await step.run(`fail: reset setupStatus (${where})`, async () =>
          db.deliberation.update({
            where: { id: deliberationId },
            data: { setupStatus: "ready" },
          })
        )
      } catch {}
      try {
        await step.run(`fail: write progress (${where})`, async () =>
          writeProgress(deliberationId, {
            stage: "failed",
            message: `Simulation failed during ${where}`,
            error: msg,
          })
        )
      } catch {}
      throw e
    }

    let personas: Persona[]
    try {
      personas = resolvePersonas({
        inlinePersonas: event.data.inlinePersonas as Persona[] | undefined,
        spec: personasSpec,
        diskDir: path.join(process.cwd(), "simulation", "personas"),
      })
    } catch (e) {
      await failAndRethrow(e, "persona resolution")
      return
    }
    if (personas.length === 0) {
      logger.warn(`No personas matched`)
      await step.run("no-personas progress", async () =>
        writeProgress(deliberationId, {
          stage: "failed",
          message: "No personas matched",
          error:
            "No personas matched the given selection. Pick at least one persona and try again.",
        })
      )
      return { message: "no personas matched" }
    }

    let ctx: ReturnType<typeof createRunContext>
    try {
      ctx = createRunContext()
    } catch (e) {
      await failAndRethrow(e, "run context init")
      return
    }
    // Personas now articulate + vote in parallel, so wall-clock is bounded
    // by the slowest persona (~60s articulate, ~40s vote) plus dedup (~60s)
    // and hypothesize (~90s), not the sum across personas.
    const estimatedSeconds = 60 + 60 + 90 + (articulateOnly ? 0 : 40) + 30

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

    try {
    // Stage 1: articulate — personas run in parallel; each updates progress
    // independently as it finishes. Inngest supports parallel `step.run` via
    // Promise.all (each step is still independently checkpointed/retried).
    await step.run("progress: articulating", async () =>
      writeProgress(deliberationId, {
        stage: "articulating",
        message: `Personas articulating values (0/${personas.length})`,
      })
    )
    let articulatedCount = 0
    const articulationRows = await Promise.all(
      personas.map(async (persona) => {
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
          logger.error(
            `Persona ${persona.slug} articulation failed: ${e.message}`
          )
        }
        articulatedCount++
        const at = articulatedCount
        await step.run(`progress: articulated ${persona.slug}`, async () =>
          writeProgress(deliberationId, {
            stage: "articulating",
            message: `Personas articulating values (${at}/${personas.length})`,
            personasArticulated: at,
          })
        )
        return row
      })
    )
    summary.push(...articulationRows)

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

    // Stage 4: vote — also parallel per persona (voting within a persona
    // remains sequential per-hypothesis inside castSimulatedEdgeVotes).
    if (!articulateOnly) {
      await step.run("progress: voting", async () =>
        writeProgress(deliberationId, {
          stage: "voting",
          message: `Personas voting on transitions (0/${personas.length})`,
        })
      )
      let votedCount = 0
      await Promise.all(
        personas.map(async (persona) => {
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
            logger.error(
              `Persona ${persona.slug} voting failed: ${e.message}`
            )
          }
          votedCount++
          const at = votedCount
          await step.run(`progress: voted ${persona.slug}`, async () =>
            writeProgress(deliberationId, {
              stage: "voting",
              message: `Personas voting on transitions (${at}/${personas.length})`,
              personasVoted: at,
            })
          )
        })
      )
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
    } catch (e) {
      await failAndRethrow(e, "main pipeline")
    }
  }
)
