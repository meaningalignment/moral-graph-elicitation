import { OpenAI } from "openai"
import { DEDUPLICATE_VALUES_PROMPT } from "./judge-prompt"

/**
 * Judges whether two values represent the same source of meaning, using the
 * 5-criterion rubric in DEDUPLICATE_VALUES_PROMPT. This is a transparent
 * in-repo alternative to values-tools' getExistingDuplicateValue — useful
 * when you want to inspect or evolve the prompt directly.
 */
export type JudgedValue = {
  title?: string
  description?: string
  policies: string[]
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
