import { OpenAI } from "openai"
import { DEDUPLICATE_VALUES_PROMPT } from "./judge-prompt"

/**
 * Judges whether two values represent the same source of meaning, using the
 * 5-criterion rubric in DEDUPLICATE_VALUES_PROMPT. This is a transparent
 * in-repo alternative to values-tools' getExistingDuplicateValue — useful
 * when you want to inspect or evolve the prompt directly.
 */
export type JudgedValue = {
  id?: number | string
  title?: string
  description?: string
  policies: string[]
}

export type ClusterVerdict = {
  /** Cluster makes sense iff ALL members are pairwise equivalent under the rubric. */
  allEquivalent: boolean
  /** If not all-equivalent, the largest subset that the judge believes is equivalent. */
  largestEquivalentSubset: Array<number | string>
  /** Member ids that the judge thinks belong to a different cluster. */
  outliers: Array<number | string>
  /** 1-3 sentence rationale citing which criteria fail (if any). */
  rationale: string
  /** Per-criterion satisfaction summary. */
  criteria: {
    completeness: boolean
    practicalEquivalence: boolean
    designAlignment: boolean
    mutualCorrection: boolean
    granularityConsistency: boolean
  }
}

function valueBlock(v: JudgedValue): string {
  return `id: ${v.id ?? "?"}
Title: ${v.title ?? "(no title)"}
Description: ${v.description ?? "(no description)"}
Policies:
${v.policies.map((p) => `- ${p}`).join("\n")}`
}

export async function judgeAreEquivalent(args: {
  a: JudgedValue
  b: JudgedValue
  model?: string
  openai?: OpenAI
}): Promise<{ equivalent: boolean; rationale: string }> {
  const client = args.openai ?? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = args.model ?? process.env.JUDGE_MODEL ?? "gpt-5"
  const isReasoningModel = /^gpt-5|^o\d/.test(model)

  const tool = {
    type: "function" as const,
    function: {
      name: "judge_equivalence",
      description: "Decide whether two value-policy sets are equivalent.",
      parameters: {
        type: "object",
        properties: {
          equivalent: {
            type: "boolean",
            description:
              "True iff ALL FIVE equivalence criteria are satisfied for the two policy sets.",
          },
          rationale: {
            type: "string",
            description: "1-2 sentences citing which criteria are/aren't satisfied.",
          },
        },
        required: ["equivalent", "rationale"],
        additionalProperties: false,
      },
    },
  }

  const userMessage = `# Value A
Title: ${args.a.title ?? "(no title)"}
Description: ${args.a.description ?? "(no description)"}
Policies:
${args.a.policies.map((p) => `- ${p}`).join("\n")}

# Value B
Title: ${args.b.title ?? "(no title)"}
Description: ${args.b.description ?? "(no description)"}
Policies:
${args.b.policies.map((p) => `- ${p}`).join("\n")}

Apply the 5-criterion rubric. Two policy sets are equivalent ONLY if all five criteria hold (Completeness, Practical Equivalence, Design Alignment, Mutual Correction, Granularity Consistency). Be strict but fair.`

  const params: any = {
    model,
    messages: [
      { role: "system", content: DEDUPLICATE_VALUES_PROMPT },
      { role: "user", content: userMessage },
    ],
    tools: [tool],
    tool_choice: { type: "function", function: { name: "judge_equivalence" } },
  }
  if (isReasoningModel) params.reasoning_effort = "low"
  else params.temperature = 0
  const resp = await client.chat.completions.create(params)

  const call = resp.choices[0]?.message?.tool_calls?.[0]
  if (!call || call.type !== "function") {
    throw new Error("Judge returned no function tool call")
  }
  return JSON.parse(call.function.arguments) as {
    equivalent: boolean
    rationale: string
  }
}

/**
 * Judge a CLUSTER (N >= 2 values). Returns whether the whole cluster is
 * one source of meaning, and if not, the largest equivalent subset and the
 * outliers. Used by the dedup dry-run to evaluate how well the production
 * pipeline grouped real ValuesCards.
 */
export async function judgeCluster(args: {
  members: JudgedValue[]
  model?: string
  openai?: OpenAI
}): Promise<ClusterVerdict> {
  if (args.members.length < 2) {
    return {
      allEquivalent: true,
      largestEquivalentSubset: args.members.map((m) => m.id ?? "?"),
      outliers: [],
      rationale: "Singleton cluster — trivially consistent.",
      criteria: {
        completeness: true,
        practicalEquivalence: true,
        designAlignment: true,
        mutualCorrection: true,
        granularityConsistency: true,
      },
    }
  }

  const client = args.openai ?? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = args.model ?? process.env.JUDGE_MODEL ?? "gpt-5"
  const isReasoningModel = /^gpt-5|^o\d/.test(model)

  const tool = {
    type: "function" as const,
    function: {
      name: "judge_cluster",
      description:
        "Judge whether a cluster of values represents a single source of meaning. If not, identify the largest equivalent subset and the outliers.",
      parameters: {
        type: "object",
        properties: {
          allEquivalent: {
            type: "boolean",
            description:
              "True iff ALL FIVE equivalence criteria are satisfied for EVERY pair in the cluster.",
          },
          largestEquivalentSubset: {
            type: "array",
            items: { type: ["string", "number"] },
            description:
              "The largest subset of member ids that ARE equivalent under the rubric. May be the full cluster.",
          },
          outliers: {
            type: "array",
            items: { type: ["string", "number"] },
            description:
              "Member ids that fail at least one criterion compared to the rest of the cluster.",
          },
          rationale: {
            type: "string",
            description: "1-3 sentences citing which criteria fail, if any.",
          },
          criteria: {
            type: "object",
            properties: {
              completeness: { type: "boolean" },
              practicalEquivalence: { type: "boolean" },
              designAlignment: { type: "boolean" },
              mutualCorrection: { type: "boolean" },
              granularityConsistency: { type: "boolean" },
            },
            required: [
              "completeness",
              "practicalEquivalence",
              "designAlignment",
              "mutualCorrection",
              "granularityConsistency",
            ],
            additionalProperties: false,
          },
        },
        required: [
          "allEquivalent",
          "largestEquivalentSubset",
          "outliers",
          "rationale",
          "criteria",
        ],
        additionalProperties: false,
      },
    },
  }

  const userMessage = `# Cluster of ${args.members.length} values

The deduplication pipeline grouped these values together as one source of meaning. Apply the 5-criterion rubric to decide whether the entire cluster is genuinely one source of meaning. If any subset diverges in policy phrasings, granularity, or what's actually being attended to, mark those members as outliers and identify the largest subset that DOES satisfy all five criteria.

${args.members.map((m, i) => `## Member ${i + 1}\n${valueBlock(m)}`).join("\n\n")}

Be strict but fair: members written with different vocabularies but pointing to the same path of attention ARE equivalent.`

  const params: any = {
    model,
    messages: [
      { role: "system", content: DEDUPLICATE_VALUES_PROMPT },
      { role: "user", content: userMessage },
    ],
    tools: [tool],
    tool_choice: { type: "function", function: { name: "judge_cluster" } },
  }
  if (isReasoningModel) params.reasoning_effort = "low"
  else params.temperature = 0
  const resp = await client.chat.completions.create(params)

  const call = resp.choices[0]?.message?.tool_calls?.[0]
  if (!call || call.type !== "function") {
    throw new Error("Cluster judge returned no function tool call")
  }
  return JSON.parse(call.function.arguments) as ClusterVerdict
}
