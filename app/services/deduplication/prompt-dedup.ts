/**
 * Prompt-based deduplication. The whole pipeline in one place: feed all
 * candidate cards (with title + description + policies) to the LLM and ask
 * for a partition under the 5-criterion rubric. No embeddings, no DBSCAN.
 *
 * Two entry points:
 *   - `partitionValues`        — batch dedup of N non-canonicalized cards.
 *                                Returns a partition + a per-cluster mapping
 *                                to existing canonical ids if applicable.
 *   - `findCanonicalDuplicate` — online dedup of one new card vs the existing
 *                                set of canonicals.
 *
 * Both share the same rubric prompt (DEDUPLICATE_VALUES_PROMPT) and the same
 * structured-output schema, so changes to the rubric automatically apply to
 * both code paths.
 */
import { z } from "zod"
import { genObj } from "~/lib/values-tools"
import { DEDUPLICATE_VALUES_PROMPT } from "./judge-prompt"

export type CardLike = {
  id: number
  title: string
  description: string
  policies: string[]
}

const ClusterSchema = z.object({
  motivation: z
    .string()
    .describe(
      "1-2 sentences explaining why these cards represent the same source of meaning under all 5 criteria. If the cluster has only one member, briefly note what makes it distinct from the others."
    ),
  memberIds: z
    .array(z.number().int())
    .describe("ids of every input card that belongs to this cluster"),
  existingCanonicalId: z
    .number()
    .int()
    .nullable()
    .describe(
      "If this cluster is equivalent (under all 5 criteria) to one of the existing canonical cards, the id of that canonical. Null if this cluster should become a new canonical."
    ),
})

const PartitionSchema = z.object({
  clusters: z
    .array(ClusterSchema)
    .describe(
      "A partition of the input cards. Every input id must appear in exactly one cluster. Singletons are returned as one-member clusters."
    ),
})

function formatCard(c: CardLike): string {
  return `id: ${c.id}
Title: ${c.title}
Description: ${c.description}
Policies:
${c.policies.map((p) => `- ${p}`).join("\n")}`
}

const PARTITION_INSTRUCTIONS = `You are deduplicating values from a deliberation. Each value has a title, a 1-2 sentence description, and a list of attention policies (things the speaker pays attention to when making a choice).

Apply the 5-criterion rubric in your system prompt. Two values belong in the same cluster ONLY IF all five criteria hold. Be strict about Granularity Consistency (a domain-specific application is NOT equivalent to a general principle) and Practical Equivalence (vocabulary overlap is not enough — the cards must direct attention to the same concrete things).

Before declaring two cards equivalent, briefly steel-man the case for splitting them. Only group them if every objection survives the rubric.

You will also be given the existing canonical cards. For each cluster you produce, decide whether the cluster is equivalent (under the same rubric) to one of the existing canonicals. If yes, return that canonical's id in \`existingCanonicalId\`. If no, return null and a new canonical will be created.

Output requirements:
- Every input card must appear in exactly one cluster.
- Singletons are valid — return them as one-member clusters.
- A canonical can be referenced by at most one cluster.`

/**
 * Batch dedup. Takes the non-canonicalized cards plus the current canonicals
 * and returns a partition.
 */
export async function partitionValues(args: {
  candidates: CardLike[]
  existingCanonicals: CardLike[]
}): Promise<{
  clusters: {
    motivation: string
    memberIds: number[]
    existingCanonicalId: number | null
  }[]
}> {
  if (args.candidates.length === 0) return { clusters: [] }

  const data = {
    instructions: PARTITION_INSTRUCTIONS,
    cardsToCluster: args.candidates.map(formatCard).join("\n\n"),
    existingCanonicals:
      args.existingCanonicals.length === 0
        ? "(none yet)"
        : args.existingCanonicals.map(formatCard).join("\n\n"),
  }

  const result = await genObj({
    prompt: DEDUPLICATE_VALUES_PROMPT,
    data,
    schema: PartitionSchema,
  })

  // Defence in depth: validate every input id appears exactly once.
  const seen = new Set<number>()
  const validClusters: typeof result.clusters = []
  for (const cluster of result.clusters) {
    const filtered = cluster.memberIds.filter((id) => {
      if (seen.has(id)) return false
      if (!args.candidates.some((c) => c.id === id)) return false
      seen.add(id)
      return true
    })
    if (filtered.length === 0) continue
    validClusters.push({ ...cluster, memberIds: filtered })
  }
  // Anything missed becomes a singleton (defensive — model usually doesn't drop ids).
  for (const c of args.candidates) {
    if (!seen.has(c.id)) {
      validClusters.push({
        motivation: "Unmatched by partitioner; treated as singleton.",
        memberIds: [c.id],
        existingCanonicalId: null,
      })
    }
  }

  return { clusters: validClusters }
}

const SingleMatchSchema = z.object({
  rationale: z
    .string()
    .describe(
      "1-2 sentences naming which criteria are or aren't satisfied. Cite the specific failing criterion if no match."
    ),
  canonicalId: z
    .number()
    .int()
    .nullable()
    .describe(
      "id of the matching canonical card, or null if none satisfy ALL FIVE criteria."
    ),
})

const SINGLE_MATCH_INSTRUCTIONS = `You are checking whether a newly-articulated value duplicates one of the existing canonical values. Apply the 5-criterion rubric strictly. Return null unless every criterion holds for some specific canonical.`

/**
 * Online dedup. Returns the matching canonical id (or null) for a single new
 * card against the existing set.
 */
export async function findCanonicalDuplicate(args: {
  candidate: CardLike
  existingCanonicals: CardLike[]
}): Promise<{ canonicalId: number | null; rationale: string }> {
  if (args.existingCanonicals.length === 0) {
    return { canonicalId: null, rationale: "No existing canonicals." }
  }

  const data = {
    instructions: SINGLE_MATCH_INSTRUCTIONS,
    candidate: formatCard(args.candidate),
    existingCanonicals: args.existingCanonicals.map(formatCard).join("\n\n"),
  }

  const result = await genObj({
    prompt: DEDUPLICATE_VALUES_PROMPT,
    data,
    schema: SingleMatchSchema,
  })

  // Validate the returned id refers to an actual existing canonical.
  if (
    result.canonicalId !== null &&
    !args.existingCanonicals.some((c) => c.id === result.canonicalId)
  ) {
    return {
      canonicalId: null,
      rationale: `Model returned unknown id ${result.canonicalId}; treated as no match.`,
    }
  }

  return result
}
