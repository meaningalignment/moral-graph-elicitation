import { describe, it, expect } from "vitest"
import { runDedupDryRun } from "./dedup-dryrun.fixture"

const RUN = process.env.RUN_PIPELINE === "1" || process.env.RUN_PIPELINE === "true"
const DELIBERATION = Number(process.env.DEDUP_DRYRUN_DELIBERATION ?? 33)
const LIMIT = Number(process.env.DEDUP_DRYRUN_LIMIT ?? 25)

describe.skipIf(!RUN)("dedup dry-run (pipeline)", () => {
  it("clusters real DB cards and the discriminator approves at least half", async () => {
    const r = await runDedupDryRun({ deliberationId: DELIBERATION, limit: LIMIT })
    for (const d of r.details) console.log(d)
    expect(r.cleanFraction).toBeGreaterThanOrEqual(0.5)
  }, 600_000)
})
