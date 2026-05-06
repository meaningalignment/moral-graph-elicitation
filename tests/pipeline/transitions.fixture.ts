/**
 * Pipeline test for transition-story quality.
 *
 * Runs as a standalone script:
 *   tsx tests/pipeline/transitions.fixture.ts
 *
 * Or as part of the vitest pipeline suite (via tests/pipeline/transitions.test.ts).
 *
 * Reads tests/fixtures/transition-triples.json (sampled from real paper data
 * via scripts/build-transitions-fixture.ts), then runs the LLM-as-judge
 * (tests/helpers/judge.ts) and asserts mean ≥ 4.0 and no individual < 2.
 */
import "dotenv/config"
import path from "node:path"
import fs from "node:fs"
import url from "node:url"
import { judgeTransitionStory, rubricMean, rubricMin, StoryRubric } from "../helpers/judge"
import { c, head, pass, fail, warn } from "../helpers/colors"

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, "..", "fixtures", "transition-triples.json")

type Triple = {
  fromValue: { title: string; description: string; policies: string[] }
  toValue: { title: string; description: string; policies: string[] }
  context: string
  story: string
}

export async function runTransitionsFixture(): Promise<{
  passed: boolean
  meanOfMeans: number
  minOfMeans: number
  perTriple: Array<{ context: string; rubric: StoryRubric; mean: number; min: number }>
  details: string[]
}> {
  if (!fs.existsSync(FIXTURE_PATH)) {
    return {
      passed: false,
      meanOfMeans: 0,
      minOfMeans: 0,
      perTriple: [],
      details: [
        fail(
          `Missing fixture: ${FIXTURE_PATH}. Run \`npm run fixtures:transitions\` first.`
        ),
      ],
    }
  }
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as {
    triples: Triple[]
  }
  const triples = fixture.triples
  const details: string[] = []
  details.push(head(`Judging ${triples.length} transition stories...`))

  const perTriple: Array<{
    context: string
    rubric: StoryRubric
    mean: number
    min: number
  }> = []

  for (const t of triples) {
    const rubric = await judgeTransitionStory({
      fromValue: t.fromValue,
      toValue: t.toValue,
      context: t.context,
      story: t.story,
    })
    const mean = rubricMean(rubric)
    const min = rubricMin(rubric)
    perTriple.push({ context: t.context, rubric, mean, min })
    const ok = mean >= 4.0 && min >= 2
    const label = `${t.fromValue.title} → ${t.toValue.title}  [${t.context.slice(0, 60)}]`
    details.push(
      `${ok ? pass("") : warn("")}  mean=${mean.toFixed(2)} min=${min}  ${c.dim}${label}${c.reset}`
    )
    details.push(
      `   ${c.gray}clarity=${rubric.clarity} gain=${rubric.gainNotLoss} fit=${rubric.contextFit} respect=${rubric.notCondescending}${c.reset}`
    )
    details.push(`   ${c.gray}${rubric.rationale}${c.reset}`)
  }

  const meanOfMeans = perTriple.reduce((s, r) => s + r.mean, 0) / perTriple.length
  const minOfMeans = Math.min(...perTriple.map((r) => r.mean))
  const passed = meanOfMeans >= 4.0 && perTriple.every((r) => r.min >= 2)
  return { passed, meanOfMeans, minOfMeans, perTriple, details }
}

const isMain = (() => {
  try {
    return url.fileURLToPath(import.meta.url) === process.argv[1]
  } catch {
    return false
  }
})()

if (isMain) {
  runTransitionsFixture()
    .then((r) => {
      console.log("\n" + head("=== Transitions fixture summary ==="))
      for (const d of r.details) console.log(d)
      console.log(`\nmean of means: ${r.meanOfMeans.toFixed(2)}`)
      console.log(`min of means:  ${r.minOfMeans.toFixed(2)}`)
      console.log(r.passed ? pass("PASS") : fail("FAIL"))
      process.exit(r.passed ? 0 : 1)
    })
    .catch((e) => {
      console.error(fail(`Crashed: ${e.message}`))
      process.exit(2)
    })
}
