import { describe, it, expect } from "vitest"
import { runDedupFixture } from "./dedup.fixture"

const RUN = process.env.RUN_PIPELINE === "1" || process.env.RUN_PIPELINE === "true"

describe.skipIf(!RUN)("dedup fixture (pipeline)", () => {
  it("partitioner agrees with hand-labelled clusters and the judge backs the rubric", async () => {
    const r = await runDedupFixture()
    for (const d of r.details) console.log(d)
    expect(r.partitionAccuracy).toBeGreaterThanOrEqual(0.8)
    expect(r.judgeAccuracy).toBeGreaterThanOrEqual(0.5)
  }, 180_000)
})
