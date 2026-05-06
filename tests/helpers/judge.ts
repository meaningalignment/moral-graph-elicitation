/**
 * LLM-as-judge for transition stories. Pinned to a deterministic config so
 * pipeline tests give stable thresholds.
 */
import { OpenAI } from "openai"

const MODEL = process.env.JUDGE_MODEL ?? "gpt-5"
const IS_REASONING = /^gpt-5|^o\d/.test(MODEL)

export type StoryRubric = {
  clarity: number
  gainNotLoss: number
  contextFit: number
  notCondescending: number
  rationale: string
}

const RUBRIC_TOOL = {
  type: "function" as const,
  function: {
    name: "score_transition_story",
    description: "Score a values-transition story on a 1-5 rubric.",
    parameters: {
      type: "object",
      properties: {
        clarity: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          description: "How clear is the story? Does it actually narrate a believable transition?",
        },
        gainNotLoss: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          description: "Does the story frame the upgrade as a *gain* in wisdom, not a loss of the original value?",
        },
        contextFit: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          description: "Does the story specifically apply to the given context, or is it generic?",
        },
        notCondescending: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          description:
            "Does the story respect adherents of the FROM value, or does it disparage them?",
        },
        rationale: {
          type: "string",
          description: "1-2 sentence rationale.",
        },
      },
      required: [
        "clarity",
        "gainNotLoss",
        "contextFit",
        "notCondescending",
        "rationale",
      ],
      additionalProperties: false,
    },
  },
}

export async function judgeTransitionStory(args: {
  fromValue: { title: string; description: string; policies: string[] }
  toValue: { title: string; description: string; policies: string[] }
  context: string
  story: string
  openai?: OpenAI
}): Promise<StoryRubric> {
  const client = args.openai ?? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const sys = `You are an evaluator scoring "wisdom upgrade" stories that describe how someone might move from one value to another in a particular context. Score on a 1-5 scale per dimension.

A high-quality story:
- clearly narrates a believable transition (clarity 5)
- frames the upgrade as a GAIN of wisdom, NOT abandoning the original value (gainNotLoss 5)
- ties tightly to the SPECIFIC context, not a generic situation (contextFit 5)
- respects adherents of the FROM value rather than disparaging them (notCondescending 5)`

  const user = `# Context
${args.context}

# From value
Title: ${args.fromValue.title}
Description: ${args.fromValue.description}
Policies:
${args.fromValue.policies.map((p) => `- ${p}`).join("\n")}

# To value
Title: ${args.toValue.title}
Description: ${args.toValue.description}
Policies:
${args.toValue.policies.map((p) => `- ${p}`).join("\n")}

# Story
${args.story}

Score the story.`

  const params: any = {
    model: MODEL,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    tools: [RUBRIC_TOOL],
    tool_choice: { type: "function", function: { name: "score_transition_story" } },
  }
  if (IS_REASONING) params.reasoning_effort = "low"
  else params.temperature = 0
  const resp = await client.chat.completions.create(params)

  const call = resp.choices[0]?.message?.tool_calls?.[0]
  if (!call || call.type !== "function") {
    throw new Error("Judge returned no function tool call")
  }
  return JSON.parse(call.function.arguments) as StoryRubric
}

export function rubricMean(r: StoryRubric): number {
  return (r.clarity + r.gainNotLoss + r.contextFit + r.notCondescending) / 4
}
export function rubricMin(r: StoryRubric): number {
  return Math.min(r.clarity, r.gainNotLoss, r.contextFit, r.notCondescending)
}
