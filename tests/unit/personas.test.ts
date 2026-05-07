import { describe, it, expect } from "vitest"
import path from "node:path"
import { loadPersonas, emailFor } from "../../simulation/personas/schema"

describe("persona loader", () => {
  const personas = loadPersonas(
    path.join(__dirname, "..", "..", "simulation", "personas")
  )

  it("loads at least the seed personas", () => {
    expect(personas.length).toBeGreaterThanOrEqual(6)
  })

  it("every persona has the required fields populated", () => {
    for (const p of personas) {
      expect(p.name).toBeTruthy()
      expect(p.slug).toMatch(/^[a-z0-9-]+$/)
      expect(p.demographic).toBeTruthy()
      expect(p.voice).toBeTruthy()
      expect(p.leanings.length).toBeGreaterThanOrEqual(2)
    }
  })

  it("returns personas sorted by slug for stable iteration", () => {
    const slugs = personas.map((p) => p.slug)
    const sorted = [...slugs].sort()
    expect(slugs).toEqual(sorted)
  })

  it("constructs simulation emails in a recognizable namespace", () => {
    const p = personas[0]
    expect(emailFor(p)).toBe(`sim+${p.slug}@simulation.local`)
  })

  it("every seed persona has a political affiliation and description", () => {
    for (const p of personas) {
      expect(
        ["liberal", "conservative", "libertarian", "moderate", "other"]
      ).toContain(p.politicalAffiliation)
      expect(p.description, `persona ${p.slug} missing description`).toBeTruthy()
    }
  })

  it("seed personas span the political spectrum", () => {
    const affs = new Set(personas.map((p) => p.politicalAffiliation))
    expect(affs.has("liberal")).toBe(true)
    expect(affs.has("conservative")).toBe(true)
    expect(affs.size).toBeGreaterThanOrEqual(3)
  })
})
