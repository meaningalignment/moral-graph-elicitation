#!/usr/bin/env tsx
/**
 * scripts/simulate.ts — drive simulated personas through a deliberation.
 *
 * Examples:
 *   tsx scripts/simulate.ts --deliberation 40 --personas 4
 *   tsx scripts/simulate.ts --deliberation 40 --personas worried-parent,civil-libertarian
 *   tsx scripts/simulate.ts --deliberation 40 --vote-only --limit 8
 *   tsx scripts/simulate.ts --deliberation 40 --articulate-only --question 123
 */
import path from "node:path"
import "dotenv/config"
import {
  createRunContext,
  simulatePersonaArticulation,
  castSimulatedEdgeVotes,
  ensureSimulatedUser,
} from "../simulation/runner"
import { loadPersonas, Persona } from "../simulation/personas/schema"

type Args = {
  deliberationId: number
  personas: string | number
  questionId?: number
  articulateOnly: boolean
  voteOnly: boolean
  voteLimit?: number
  dryRun: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (name: string) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const has = (name: string) => argv.includes(name)
  const deliberationId = Number(get("--deliberation"))
  if (!deliberationId) {
    console.error(
      "Usage: tsx scripts/simulate.ts --deliberation <id> [--personas <n|csv>] [--question <id>] [--articulate-only|--vote-only] [--limit <n>] [--dry-run]"
    )
    process.exit(1)
  }
  return {
    deliberationId,
    personas: get("--personas") ?? "4",
    questionId: get("--question") ? Number(get("--question")) : undefined,
    articulateOnly: has("--articulate-only"),
    voteOnly: has("--vote-only"),
    voteLimit: get("--limit") ? Number(get("--limit")) : undefined,
    dryRun: has("--dry-run"),
  }
}

function selectPersonas(all: Persona[], spec: string | number): Persona[] {
  if (typeof spec === "number" || /^\d+$/.test(String(spec))) {
    const n = Number(spec)
    return all.slice(0, Math.min(n, all.length))
  }
  const slugs = String(spec)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const out: Persona[] = []
  for (const s of slugs) {
    const found = all.find((p) => p.slug === s || p.name === s)
    if (!found) throw new Error(`Persona not found: ${s}`)
    out.push(found)
  }
  return out
}

async function main() {
  const args = parseArgs()
  const all = loadPersonas(path.join(process.cwd(), "simulation", "personas"))
  if (all.length === 0) {
    console.error("No personas found in simulation/personas/")
    process.exit(1)
  }
  const personas = selectPersonas(all, args.personas)
  const ctx = createRunContext()

  console.log(`Run ${ctx.runId}`)
  console.log(`Deliberation ${args.deliberationId}`)
  console.log(`Personas: ${personas.map((p) => p.slug).join(", ")}`)
  if (args.dryRun) {
    console.log("[dry-run] would simulate but not call any LLM or DB")
    return
  }

  const rows: any[] = []
  for (const persona of personas) {
    const user = await ensureSimulatedUser(persona)
    const row: any = { persona: persona.slug, userId: user.id }
    try {
      if (!args.voteOnly) {
        const r = await simulatePersonaArticulation({
          persona,
          deliberationId: args.deliberationId,
          questionId: args.questionId,
          ctx,
        })
        row.chatId = r.chatId
        row.cardId = r.cardId
        row.turns = r.turns
        row.submitted = r.submitted
      }
      if (!args.articulateOnly) {
        const v = await castSimulatedEdgeVotes({
          persona,
          deliberationId: args.deliberationId,
          ctx,
          limit: args.voteLimit,
        })
        row.agreed = v.agreed
        row.disagreed = v.disagreed
        row.skipped = v.skipped
      }
    } catch (e: any) {
      row.error = e.message
    }
    rows.push(row)
  }

  console.log("\nResults:")
  console.table(rows)
  console.log(`\nTranscripts written to simulation/transcripts/${ctx.runId}/`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
