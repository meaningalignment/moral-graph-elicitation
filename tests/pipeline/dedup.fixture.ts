/**
 * Pipeline test for value deduplication.
 *
 * Runs as a standalone script:
 *   tsx tests/pipeline/dedup.fixture.ts
 *
 * Or as part of the vitest pipeline suite (via tests/pipeline/dedup.test.ts).
 *
 * Drives the prompt-based partitioner against a labelled fixture and asserts:
 *   - cards with the same `expectedCluster` end up in the same partition
 *   - cards with different `expectedCluster` end up in different partitions
 *   - the in-repo judge agrees with the labels on hand-picked positive and
 *     negative pairs (smoke for the rubric prompt itself)
 */
import "dotenv/config"
import path from "node:path"
import fs from "node:fs"
import url from "node:url"
import { configureValuesTools, PromptCache } from "values-tools"
import { c, head, pass, fail, warn } from "../helpers/colors"
import { judgeAreEquivalent } from "~/services/deduplication/in-repo-judge"
import { partitionValues } from "~/services/deduplication/prompt-dedup"

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))

// Pin to OpenAI so the fixture works without an ANTHROPIC_API_KEY.
// gpt-5 / reasoning models require temperature=1, so set it here.
configureValuesTools({
  defaultModel: process.env.VALUES_TOOLS_MODEL ?? "gpt-5",
  defaultTemperature: 1,
  cache: new PromptCache(),
})

type FixtureCard = {
  id: string
  title: string
  description: string
  policies: string[]
  expectedCluster: string
}

const FIXTURE_PATH = path.join(__dirname, "..", "fixtures", "dedup-cards.json")

export async function runDedupFixture(): Promise<{
  passed: boolean
  partitionAccuracy: number
  judgeAccuracy: number
  details: string[]
}> {
  const raw = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as {
    cards: FixtureCard[]
  }
  const fixtureCards = raw.cards
  const details: string[] = []

  // The partitioner takes numeric ids; map fixture string ids ↔ ints.
  const candidates = fixtureCards.map((c, i) => ({
    id: i,
    title: c.title,
    description: c.description,
    policies: c.policies,
  }))

  details.push(head(`Partitioning ${fixtureCards.length} cards...`))
  const { clusters } = await partitionValues({
    candidates,
    existingCanonicals: [],
  })
  details.push(`Pipeline produced ${clusters.length} clusters`)

  // Build {id -> cluster index} so we can compare expectedCluster labels.
  const idToCluster = new Map<number, number>()
  clusters.forEach((cluster, ci) =>
    cluster.memberIds.forEach((id) => idToCluster.set(id, ci))
  )

  let pairHits = 0
  let pairAttempts = 0
  for (let i = 0; i < fixtureCards.length; i++) {
    for (let j = i + 1; j < fixtureCards.length; j++) {
      pairAttempts++
      const sameCluster = idToCluster.get(i) === idToCluster.get(j)
      const sameLabel =
        fixtureCards[i].expectedCluster === fixtureCards[j].expectedCluster
      if (sameCluster === sameLabel) pairHits++
    }
  }
  const partitionAccuracy = pairAttempts ? pairHits / pairAttempts : 1
  details.push(
    `${c.gray}pairwise partition agreement:${c.reset} ${(partitionAccuracy * 100).toFixed(1)}% (${pairHits}/${pairAttempts})`
  )

  // Judge sanity check: hand-pick a positive (kindness pair) and a negative
  // (kindness vs duty) and assert the rubric prompt classifies them correctly.
  const kindness = fixtureCards.filter((c) => c.expectedCluster === "kindness")
  const duty = fixtureCards.find((c) => c.expectedCluster === "duty")
  let judgeHits = 0
  let judgeAttempts = 0

  if (kindness.length >= 2) {
    judgeAttempts++
    const pos = await judgeAreEquivalent({ a: kindness[0], b: kindness[1] })
    if (pos.equivalent) {
      judgeHits++
      details.push(pass(`In-repo judge: '${kindness[0].id}' ≡ '${kindness[1].id}' (${pos.rationale})`))
    } else {
      details.push(fail(`In-repo judge: '${kindness[0].id}' ≢ '${kindness[1].id}' (${pos.rationale})`))
    }
    if (duty) {
      judgeAttempts++
      const neg = await judgeAreEquivalent({ a: kindness[0], b: duty })
      if (!neg.equivalent) {
        judgeHits++
        details.push(pass(`In-repo judge: '${kindness[0].id}' correctly NOT ≡ '${duty.id}'`))
      } else {
        details.push(fail(`In-repo judge: '${kindness[0].id}' wrongly ≡ '${duty.id}'`))
      }
    }
  } else {
    details.push(warn("Skipping judge check: <2 kindness cards in fixture."))
  }

  const judgeAccuracy = judgeAttempts ? judgeHits / judgeAttempts : 1
  const passed = partitionAccuracy >= 0.85 && judgeAccuracy >= 0.9

  return {
    passed,
    partitionAccuracy,
    judgeAccuracy,
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
  runDedupFixture()
    .then((r) => {
      console.log("\n" + head("=== Dedup fixture summary ==="))
      for (const d of r.details) console.log(d)
      console.log(
        `\npartition agreement: ${(r.partitionAccuracy * 100).toFixed(1)}%`
      )
      console.log(`in-repo judge accuracy: ${(r.judgeAccuracy * 100).toFixed(0)}%`)
      console.log(r.passed ? pass("PASS") : fail("FAIL"))
      process.exit(r.passed ? 0 : 1)
    })
    .catch((e) => {
      console.error(fail(`Crashed: ${e.message}`))
      process.exit(2)
    })
}
