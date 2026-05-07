import fs from "node:fs"
import path from "node:path"

export type PoliticalAffiliation =
  | "liberal"
  | "conservative"
  | "libertarian"
  | "moderate"
  | "other"

export interface Persona {
  /** Display name, e.g. "Worried Parent". */
  name: string
  /** URL-safe slug, e.g. "worried-parent". Becomes the email local-part. */
  slug: string
  /** Demographic shorthand. */
  demographic: string
  /** One-line description for UI display. */
  description?: string
  /** Voice / speaking style for the persona's user-side replies. */
  voice: string
  /** Initial leanings or beliefs the persona brings to the deliberation. */
  leanings: string[]
  /** Coarse political affiliation, used for badges and balance. */
  politicalAffiliation?: PoliticalAffiliation
  /** Optional question title preference (matches Question.title or substring). */
  questionPreference?: string
  /** Optional override for which simulation model to use for this persona. */
  model?: string
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

export function loadPersonas(dir: string): Persona[] {
  const out: Persona[] = []
  if (!fs.existsSync(dir)) return out
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Partial<Persona>
    if (!raw.name) throw new Error(`Persona ${f} missing 'name'`)
    out.push({
      name: raw.name,
      slug: raw.slug ?? slugify(raw.name),
      demographic: raw.demographic ?? "",
      description: raw.description,
      voice: raw.voice ?? "",
      leanings: raw.leanings ?? [],
      politicalAffiliation: raw.politicalAffiliation,
      questionPreference: raw.questionPreference,
      model: raw.model,
    })
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug))
}

export function emailFor(persona: Persona): string {
  return `sim+${persona.slug}@simulation.local`
}
