#!/usr/bin/env tsx
/**
 * Manually seed questions + contexts for an existing deliberation.
 * Useful if Inngest wasn't running when the deliberation was created
 * (the original event got dropped).
 *
 * Usage:
 *   npm run seed -- --deliberation 42
 *   npm run seed -- --deliberation 42 --num-questions 4 --num-contexts 4
 */
import "dotenv/config"
import { neon } from "@neondatabase/serverless"
import { seedQuestionsAndContextsCore } from "../app/services/generation"

async function main() {
  const argv = process.argv.slice(2)
  const get = (n: string) => {
    const i = argv.indexOf(n)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const deliberationId = Number(get("--deliberation"))
  if (!deliberationId) {
    console.error("Usage: tsx scripts/seed-deliberation.ts --deliberation <id> [--num-questions N] [--num-contexts N]")
    process.exit(1)
  }
  const numQuestions = Number(get("--num-questions") ?? 5)
  const numContexts = Number(get("--num-contexts") ?? 5)

  // Look up the deliberation's topic via the HTTPS Neon driver (works in
  // sandboxes that block raw 5432/tcp).
  const sql = neon(process.env.POSTGRES_URL!)
  const rows = (await sql.query(
    `SELECT id, topic, "setupStatus" FROM "Deliberation" WHERE id = $1`,
    [deliberationId]
  )) as any[]
  if (!rows.length) {
    console.error(`Deliberation ${deliberationId} not found`)
    process.exit(1)
  }
  const { topic, setupStatus } = rows[0]
  console.log(`Seeding deliberation ${deliberationId} (topic: "${topic}", current status: ${setupStatus})`)

  const result = await seedQuestionsAndContextsCore({
    deliberationId,
    topic,
    numQuestions,
    numContexts,
  })
  console.log(`Done — ${result.questionIds.length} questions, ${result.contextCount} contexts.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
