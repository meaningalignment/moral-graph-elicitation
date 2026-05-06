import { describe, it, expect } from "vitest"
import { runTransitionsFixture } from "./transitions.fixture"

const RUN = process.env.RUN_PIPELINE === "1" || process.env.RUN_PIPELINE === "true"

describe.skipIf(!RUN)("transitions fixture (pipeline)", () => {
  it("transition stories score well on the rubric", async () => {
    const r = await runTransitionsFixture()
    for (const d of r.details) console.log(d)
    expect(r.meanOfMeans).toBeGreaterThanOrEqual(4.0)
    for (const t of r.perTriple) expect(t.min).toBeGreaterThanOrEqual(2)
  }, 300_000)
})
