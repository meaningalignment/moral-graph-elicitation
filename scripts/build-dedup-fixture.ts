#!/usr/bin/env tsx
/**
 * Refresh tests/fixtures/dedup-cards.json by sampling representative cards
 * from a real deliberation (defaults to 33, the paper's "Abortion Policy").
 *
 * The output preserves the existing curated structure: each card has an
 * 'expectedCluster' label that you should hand-verify after running.
 *
 * Usage:
 *   npm run fixtures:dedup
 *   npm run fixtures:dedup -- --deliberation 40
 */
import "dotenv/config"
import path from "node:path"
import fs from "node:fs"
import { neon } from "@neondatabase/serverless"

async function main() {
  const argv = process.argv.slice(2)
  const get = (n: string) => {
    const i = argv.indexOf(n)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const deliberationId = Number(get("--deliberation") ?? 33)
  const url = process.env.POSTGRES_URL
  if (!url) throw new Error("POSTGRES_URL is not set")
  const sql = neon(url)

  // Strategy: sample 5 canonicals + their first 2 ValuesCard children each
  // (which are by construction in the same canonical cluster), then 5 more
  // distinct canonicals. The reviewer hand-confirms expectedCluster after.
  const canonicals = (await sql.query(
    `SELECT id, title, description, policies FROM "CanonicalValuesCard"
     WHERE "deliberationId" = $1 AND "isArchived" = false
     ORDER BY id ASC
     LIMIT 10`,
    [deliberationId]
  )) as any[]

  const out: any[] = []
  for (const cv of canonicals.slice(0, 5)) {
    const children = (await sql.query(
      `SELECT id, title, description, policies FROM "ValuesCard"
       WHERE "canonicalCardId" = $1
       LIMIT 2`,
      [cv.id]
    )) as any[]
    const cluster = `c${cv.id}`
    out.push({
      id: `${cluster}-canon`,
      title: cv.title,
      description: cv.description,
      policies: cv.policies,
      expectedCluster: cluster,
    })
    for (const ch of children) {
      out.push({
        id: `${cluster}-child-${ch.id}`,
        title: ch.title,
        description: ch.description,
        policies: ch.policies,
        expectedCluster: cluster,
      })
    }
  }
  for (const cv of canonicals.slice(5, 10)) {
    out.push({
      id: `c${cv.id}-only`,
      title: cv.title,
      description: cv.description,
      policies: cv.policies,
      expectedCluster: `c${cv.id}-only`,
    })
  }

  const outPath = path.join(
    process.cwd(),
    "tests",
    "fixtures",
    "dedup-cards.from-paper.json"
  )
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        _README:
          "Auto-sampled from paper data; hand-verify expectedCluster labels before relying on this fixture.",
        sourceDeliberationId: deliberationId,
        cards: out,
      },
      null,
      2
    )
  )
  console.log(`Wrote ${out.length} cards → ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
