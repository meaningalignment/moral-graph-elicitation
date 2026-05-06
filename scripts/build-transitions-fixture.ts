#!/usr/bin/env tsx
/**
 * Build tests/fixtures/transition-triples.json by sampling N transition
 * stories from a real deliberation. Defaults to deliberation 33 (the paper's
 * "Abortion Policy", largest in the DB).
 *
 * Usage:
 *   npm run fixtures:transitions
 *   npm run fixtures:transitions -- --deliberation 40 --n 6
 */
import "dotenv/config"
import path from "node:path"
import fs from "node:fs"
import { neon } from "@neondatabase/serverless"

type Triple = {
  fromValue: { id: number; title: string; description: string; policies: string[] }
  toValue: { id: number; title: string; description: string; policies: string[] }
  context: string
  story: string
}

async function main() {
  const argv = process.argv.slice(2)
  const get = (n: string) => {
    const i = argv.indexOf(n)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const deliberationId = Number(get("--deliberation") ?? 33)
  const n = Number(get("--n") ?? 6)

  const url = process.env.POSTGRES_URL
  if (!url) throw new Error("POSTGRES_URL is not set")
  const sql = neon(url)

  const rows = (await sql.query(
    `SELECT eh."fromId", eh."toId", eh."contextId", eh.story,
            f.title AS f_title, f.description AS f_desc, f.policies AS f_pol,
            t.title AS t_title, t.description AS t_desc, t.policies AS t_pol
     FROM "EdgeHypothesis" eh
     JOIN "CanonicalValuesCard" f ON f.id = eh."fromId"
     JOIN "CanonicalValuesCard" t ON t.id = eh."toId"
     WHERE eh."deliberationId" = $1
       AND eh.story IS NOT NULL
       AND length(eh.story) > 200
     ORDER BY eh."createdAt" DESC
     LIMIT $2`,
    [deliberationId, n]
  )) as any[]

  const triples: Triple[] = rows.map((r) => ({
    fromValue: {
      id: r.fromId,
      title: r.f_title,
      description: r.f_desc,
      policies: r.f_pol as string[],
    },
    toValue: {
      id: r.toId,
      title: r.t_title,
      description: r.t_desc,
      policies: r.t_pol as string[],
    },
    context: r.contextId,
    story: r.story,
  }))

  const out = path.join(process.cwd(), "tests", "fixtures", "transition-triples.json")
  fs.writeFileSync(
    out,
    JSON.stringify(
      { _README: "Sampled from real paper data; safe to delete and rebuild.", sourceDeliberationId: deliberationId, triples },
      null,
      2
    )
  )
  console.log(`Wrote ${triples.length} triples → ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
