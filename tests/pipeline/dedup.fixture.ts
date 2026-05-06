/**
 * Pipeline test for value deduplication.
 *
 * Runs as a standalone script:
 *   tsx tests/pipeline/dedup.fixture.ts
 *
 * Or as part of the vitest pipeline suite (via tests/pipeline/dedup.test.ts).
 *
 * Embeds every fixture card via values-tools, then asserts that within-cluster
 * cosine distances are smaller than between-cluster distances. Also runs the
 * LLM judge to confirm same-cluster pairs are flagged as duplicates.
 */
import "dotenv/config"
import path from "node:path"
import fs from "node:fs"
import url from "node:url"
import {
  embedValue,
  getExistingDuplicateValue,
  configureValuesTools,
  PromptCache,
} from "values-tools"
import { c, head, pass, fail, warn } from "../helpers/colors"
import { judgeAreEquivalent } from "~/services/deduplication/in-repo-judge"

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

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export async function runDedupFixture(): Promise<{
  passed: boolean
  withinMean: number
  betweenMean: number
  withinMax: number
  betweenMin: number
  judgeAccuracy: number
  valuesToolsAccuracy: number
  details: string[]
}> {
  const raw = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as {
    cards: FixtureCard[]
  }
  const cards = raw.cards
  const details: string[] = []

  details.push(head(`Embedding ${cards.length} cards...`))
  const cardsWithEmbeddings = await Promise.all(
    cards.map(async (card, i) => ({
      card,
      embedding: (await embedValue({
        id: i,
        title: card.title,
        description: card.description,
        policies: card.policies,
      } as any)) as number[],
    }))
  )

  let withinSum = 0,
    withinN = 0,
    betweenSum = 0,
    betweenN = 0
  let withinMax = 0,
    betweenMin = 1

  for (let i = 0; i < cardsWithEmbeddings.length; i++) {
    for (let j = i + 1; j < cardsWithEmbeddings.length; j++) {
      const a = cardsWithEmbeddings[i]
      const b = cardsWithEmbeddings[j]
      const d = cosineDistance(a.embedding, b.embedding)
      if (a.card.expectedCluster === b.card.expectedCluster) {
        withinSum += d
        withinN++
        if (d > withinMax) withinMax = d
      } else {
        betweenSum += d
        betweenN++
        if (d < betweenMin) betweenMin = d
      }
    }
  }

  const withinMean = withinN ? withinSum / withinN : 0
  const betweenMean = betweenN ? betweenSum / betweenN : 0

  details.push(
    `${c.gray}within-cluster mean distance:${c.reset}  ${withinMean.toFixed(4)} (max ${withinMax.toFixed(4)})`
  )
  details.push(
    `${c.gray}between-cluster mean distance:${c.reset} ${betweenMean.toFixed(4)} (min ${betweenMin.toFixed(4)})`
  )

  // Two judges: the in-repo OpenAI-based one (using our verbatim 5-criterion
  // prompt) and the values-tools one (Claude-style, used in production).
  // We assert on the in-repo one since it uses the prompt the user has agreed
  // to. The values-tools result is reported as a comparator.
  const kindness = cards.filter((c) => c.expectedCluster === "kindness")
  let inRepoHits = 0
  let inRepoAttempts = 0
  let vtHits = 0
  let vtAttempts = 0

  if (kindness.length >= 2) {
    const candidate = kindness[0]
    const others = kindness.slice(1)

    // Positive case (in-repo)
    inRepoAttempts++
    const inRepoPos = await judgeAreEquivalent({
      a: candidate,
      b: others[0],
    })
    if (inRepoPos.equivalent) {
      inRepoHits++
      details.push(pass(`In-repo judge: '${candidate.id}' ≡ '${others[0].id}' (${inRepoPos.rationale})`))
    } else {
      details.push(fail(`In-repo judge: '${candidate.id}' ≢ '${others[0].id}' (${inRepoPos.rationale})`))
    }

    // Negative case (in-repo)
    const dutyCard = cards.find((c) => c.expectedCluster === "duty")
    if (dutyCard) {
      inRepoAttempts++
      const inRepoNeg = await judgeAreEquivalent({
        a: candidate,
        b: dutyCard,
      })
      if (!inRepoNeg.equivalent) {
        inRepoHits++
        details.push(pass(`In-repo judge: '${candidate.id}' correctly NOT ≡ '${dutyCard.id}'`))
      } else {
        details.push(fail(`In-repo judge: '${candidate.id}' wrongly ≡ '${dutyCard.id}'`))
      }
    }

    // Reporting only: values-tools judge (production path; uses array indexing).
    vtAttempts++
    try {
      const vtMatched = await getExistingDuplicateValue<any, any>(
        {
          id: 0,
          title: candidate.title,
          description: candidate.description,
          policies: candidate.policies,
        },
        others.map((o, i) => ({
          id: i + 1,
          title: o.title,
          description: o.description,
          policies: o.policies,
        }))
      )
      if (vtMatched) {
        vtHits++
        details.push(
          pass(
            `${c.dim}values-tools judge: clustered (id=${(vtMatched as any).id})${c.reset}`
          )
        )
      } else {
        details.push(
          warn(`values-tools judge did not cluster (production path is more conservative)`)
        )
      }
    } catch (e) {
      details.push(warn(`values-tools judge errored: ${(e as Error).message}`))
    }
  } else {
    details.push(warn("Skipping judge check: <2 kindness cards in fixture."))
  }

  const judgeAccuracy = inRepoAttempts ? inRepoHits / inRepoAttempts : 1
  const valuesToolsAccuracy = vtAttempts ? vtHits / vtAttempts : 1
  const passed = withinMean < betweenMean && judgeAccuracy >= 0.9
  return {
    passed,
    withinMean,
    betweenMean,
    withinMax,
    betweenMin,
    judgeAccuracy,
    valuesToolsAccuracy,
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
        `\nwithin mean: ${r.withinMean.toFixed(4)}  between mean: ${r.betweenMean.toFixed(4)}`
      )
      console.log(`in-repo judge accuracy: ${(r.judgeAccuracy * 100).toFixed(0)}%`)
      console.log(`values-tools judge accuracy: ${(r.valuesToolsAccuracy * 100).toFixed(0)}%`)
      console.log(r.passed ? pass("PASS") : fail("FAIL"))
      process.exit(r.passed ? 0 : 1)
    })
    .catch((e) => {
      console.error(fail(`Crashed: ${e.message}`))
      process.exit(2)
    })
}
