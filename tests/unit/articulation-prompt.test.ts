import { describe, it, expect } from "vitest"
import {
  ARTICULATION_SYSTEM_PROMPT,
  SUBMIT_VALUES_CARD_TOOL,
} from "~/services/articulation/prompt"
import {
  DEDUPLICATE_VALUES_PROMPT,
  DEDUPLICATE_CRITERIA,
} from "~/services/deduplication/judge-prompt"

describe("articulation prompt", () => {
  it("instructs the assistant to use the submit_values_card tool", () => {
    expect(ARTICULATION_SYSTEM_PROMPT).toContain("submit_values_card")
  })

  it("walks through the canonical 5-step dialogue", () => {
    for (const step of [
      "Start with a personal, meaningful story",
      "Zoom in on the",
      "attention policies",
      "Call `submit_values_card`",
    ]) {
      expect(ARTICULATION_SYSTEM_PROMPT).toContain(step)
    }
  })

  it("forbids the assistant from using jargon with the user", () => {
    expect(ARTICULATION_SYSTEM_PROMPT).toMatch(
      /DON'T use the terms here \("attention policies", "policies", "sources of meaning"\)/
    )
  })

  it("exposes a tool schema with the three required fields", () => {
    expect(SUBMIT_VALUES_CARD_TOOL.function.name).toBe("submit_values_card")
    const props = (SUBMIT_VALUES_CARD_TOOL.function.parameters as any)
      .properties
    expect(Object.keys(props).sort()).toEqual([
      "description",
      "policies",
      "title",
    ])
    expect((SUBMIT_VALUES_CARD_TOOL.function.parameters as any).required).toEqual([
      "title",
      "description",
      "policies",
    ])
  })
})

describe("dedup judge prompt", () => {
  it("includes all five equivalence criteria", () => {
    for (const criterion of DEDUPLICATE_CRITERIA) {
      expect(DEDUPLICATE_VALUES_PROMPT).toContain(criterion)
    }
  })

  it("requires ALL criteria for equivalence", () => {
    expect(DEDUPLICATE_VALUES_PROMPT).toMatch(/All five criteria must be satisfied/)
  })
})
