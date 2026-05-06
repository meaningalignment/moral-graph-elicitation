import { describe, it, expect } from "vitest"
import { runDedupFixture } from "./dedup.fixture"

const RUN = process.env.RUN_PIPELINE === "1" || process.env.RUN_PIPELINE === "true"

describe.skipIf(!RUN)("dedup fixture (pipeline)", () => {
  it("within-cluster pairs are closer than between-cluster pairs and judge agrees", async () => {
    const r = await runDedupFixture()
    for (const d of r.details) console.log(d)
    expect(r.withinMean).toBeLessThan(r.betweenMean)
    expect(r.judgeAccuracy).toBeGreaterThanOrEqual(0.5)
  }, 180_000)
})
