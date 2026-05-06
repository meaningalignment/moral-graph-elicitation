/**
 * Dedup dry-run.
 *
 * Reads ValuesCards from a deliberation, runs the EXACT clustering function
 * (`deduplicateValues` from values-tools — same one the production cron uses),
 * and then asks an in-repo discriminator judge whether each resulting cluster
 * actually makes sense under the 5-criterion rubric.
 *
 * No DB writes. No CanonicalValuesCard creation. No `canonicalCardId` updates.
 *
 * Runs as a standalone script:
 *   tsx tests/pipeline/dedup-dryrun.fixture.ts --deliberation 33 --limit 40
 *
 * Or as part of the gated vitest pipeline suite (dedup-dryrun.test.ts).
 */
import "dotenv/config"
import url from "node:url"
import path from "node:path"
import { neon } from "@neondatabase/serverless"
import {
  configureValuesTools,
  PromptCache,
  deduplicateValues,
} from "values-tools"
import {
  judgeCluster,
  ClusterVerdict,
} from "~/services/deduplication/in-repo-judge"
import { c, head, pass, fail, warn } from "../helpers/colors"

configureValuesTools({
  defaultModel: process.env.VALUES_TOOLS_MODEL ?? "gpt-5",
  defaultTemperature: 1,
  cache: new PromptCache(),
})

type Card = {
  id: number
  title: string
  description: string
  policies: string[]
}

export type DryRunSummary = {
  deliberationId: number
  cardsLoaded: number
  clusters: number
  multiMemberClusters: number
  cleanClusters: number // judge says allEquivalent
  dirtyClusters: number // judge says NOT allEquivalent
  cleanFraction: number // cleanClusters / multiMemberClusters
  perCluster: Array<{
    size: number
    members: Array<{ id: number; title: string }>
    verdict: ClusterVerdict
  }>
  details: string[]
}

export async function runDedupDryRun(opts: {
  deliberationId: number
  limit?: number
  useDbScan?: boolean
  pgUrl?: string
}): Promise<DryRunSummary> {
  const details: string[] = []
  const pgUrl = opts.pgUrl ?? process.env.POSTGRES_URL
  if (!pgUrl) throw new Error("POSTGRES_URL is not set")
  const sql = neon(pgUrl)

  details.push(
    head(`Loading ValuesCards from deliberation ${opts.deliberationId}...`)
  )
  const limit = opts.limit ?? 40
  const cards = (await sql.query(
    `SELECT id, title, description, policies
     FROM "ValuesCard"
     WHERE "deliberationId" = $1
     ORDER BY id ASC
     LIMIT $2`,
    [opts.deliberationId, limit]
  )) as Card[]
  details.push(`Loaded ${cards.length} cards`)
  if (cards.length < 2) {
    return {
      deliberationId: opts.deliberationId,
      cardsLoaded: cards.length,
      clusters: cards.length,
      multiMemberClusters: 0,
      cleanClusters: 0,
      dirtyClusters: 0,
      cleanFraction: 1,
      perCluster: [],
      details: [...details, warn("Need at least 2 cards to test clustering.")],
    }
  }

  // useDbScan mirrors production: only when N>20.
  const useDbScan = opts.useDbScan ?? cards.length > 20
  details.push(
    `Clustering with deduplicateValues (useDbScan=${useDbScan})...`
  )
  const clusters = (await deduplicateValues<Card>(
    cards,
    null,
    useDbScan
  )) as Card[][]
  details.push(`Pipeline produced ${clusters.length} clusters`)

  const perCluster: DryRunSummary["perCluster"] = []
  let cleanClusters = 0
  let dirtyClusters = 0
  let multiMemberClusters = 0

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i]
    if (cluster.length < 2) continue
    multiMemberClusters++

    const verdict = await judgeCluster({
      members: cluster.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        policies: c.policies,
      })),
    })
    perCluster.push({
      size: cluster.length,
      members: cluster.map((c) => ({ id: c.id, title: c.title })),
      verdict,
    })
    if (verdict.allEquivalent) {
      cleanClusters++
      details.push(
        pass(
          `Cluster ${i + 1} (${cluster.length} cards): clean — ${cluster
            .slice(0, 3)
            .map((c) => `#${c.id}`)
            .join(", ")}${cluster.length > 3 ? ", ..." : ""}`
        )
      )
    } else {
      dirtyClusters++
      details.push(
        fail(
          `Cluster ${i + 1} (${cluster.length} cards): outliers ${verdict.outliers
            .map((o) => `#${o}`)
            .join(", ")}  — ${verdict.rationale}`
        )
      )
    }
  }

  const singletons = clusters.length - multiMemberClusters
  if (singletons > 0) details.push(`${c.gray}${singletons} singleton clusters${c.reset}`)

  const cleanFraction =
    multiMemberClusters > 0 ? cleanClusters / multiMemberClusters : 1

  return {
    deliberationId: opts.deliberationId,
    cardsLoaded: cards.length,
    clusters: clusters.length,
    multiMemberClusters,
    cleanClusters,
    dirtyClusters,
    cleanFraction,
    perCluster,
    details,
  }
}

const isMain = (() => {
  try {
    return url.fileURLToPath(import.meta.url) === process.argv[1]
  } catch {
    return false
  }
})()

if (isMain) {
  const argv = process.argv.slice(2)
  const get = (n: string) => {
    const i = argv.indexOf(n)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const deliberationId = Number(get("--deliberation") ?? 33)
  const limit = get("--limit") ? Number(get("--limit")) : undefined
  runDedupDryRun({ deliberationId, limit })
    .then((r) => {
      console.log("\n" + head("=== Dedup dry-run summary ==="))
      for (const d of r.details) console.log(d)
      console.log(
        `\ncards loaded:           ${r.cardsLoaded}` +
          `\nclusters total:         ${r.clusters}` +
          `\nmulti-member clusters:  ${r.multiMemberClusters}` +
          `\nclean (judge says ok):  ${r.cleanClusters}` +
          `\ndirty (judge dissents): ${r.dirtyClusters}` +
          `\nclean fraction:         ${(r.cleanFraction * 100).toFixed(1)}%`
      )
      const dirty = r.perCluster.filter((p) => !p.verdict.allEquivalent)
      if (dirty.length) {
        console.log("\n" + head("Dirty clusters detail:"))
        for (const d of dirty) {
          console.log(
            `\n  cluster of ${d.size}: ${d.members.map((m) => `#${m.id} ${m.title}`).join(" | ")}`
          )
          console.log(`  rationale: ${c.gray}${d.verdict.rationale}${c.reset}`)
          console.log(
            `  outliers: ${d.verdict.outliers.map((o) => `#${o}`).join(", ")}`
          )
          console.log(
            `  largest equivalent subset: ${d.verdict.largestEquivalentSubset
              .map((id) => `#${id}`)
              .join(", ")}`
          )
        }
      }
      // The standalone script is diagnostic-only — it always exits 0
      // unless something crashed. The vitest wrapper enforces a regression
      // threshold (see tests/pipeline/dedup-dryrun.test.ts).
      console.log(
        "\n" +
          (r.cleanFraction >= 0.7
            ? pass("Healthy (≥70% clean)")
            : r.cleanFraction >= 0.5
            ? warn("Mixed (50–70% clean) — review the dirty clusters above")
            : fail("Concerning (<50% clean) — pipeline likely needs tuning"))
      )
      process.exit(0)
    })
    .catch((e) => {
      console.error(fail(`Crashed: ${e.message}`))
      console.error(e.stack)
      process.exit(2)
    })
}
