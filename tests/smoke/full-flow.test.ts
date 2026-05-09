import { describe, it, expect } from "vitest"
import { runSmokeTest } from "./full-flow.fixture"

const RUN = process.env.RUN_SMOKE === "1" || process.env.RUN_SMOKE === "true"

// Real OpenAI calls + a real DB + real Inngest. Costs credits, takes minutes.
// Gate behind RUN_SMOKE=1 so it never runs accidentally.
describe.skipIf(!RUN)("full-flow smoke", () => {
  it("articulates, dedupes, hypothesizes, chats, votes, exports a graph", async () => {
    const r = await runSmokeTest()
    expect(r.articulated).toBeGreaterThanOrEqual(2)
    expect(r.canonicals).toBeGreaterThanOrEqual(1)
    expect(r.hypotheses).toBeGreaterThanOrEqual(1)
    expect(r.edges).toBeGreaterThanOrEqual(1)
  }, 30 * 60_000)
})
