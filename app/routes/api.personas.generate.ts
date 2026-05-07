import { ActionFunctionArgs, json } from "@remix-run/node"
import { OpenAI } from "openai"
import { auth, openai } from "~/config.server"
import type { Persona, PoliticalAffiliation } from "../../simulation/personas/schema"

const MODEL = process.env.SIMULATION_MODEL ?? "gpt-5"
const IS_REASONING = /^gpt-5|^o\d/.test(MODEL)

const TOOL = {
  type: "function" as const,
  function: {
    name: "create_persona",
    description: "Generate a deliberation persona spec.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Display name (2-4 words). Avoid common first names; prefer descriptive labels.",
        },
        slug: {
          type: "string",
          description: "URL-safe slug, e.g. 'tech-optimist'",
        },
        description: {
          type: "string",
          description: "One-line description for UI display (under 80 chars).",
        },
        demographic: {
          type: "string",
          description:
            "1-2 sentence demographic summary (age, profession, region, family).",
        },
        politicalAffiliation: {
          type: "string",
          enum: ["liberal", "conservative", "libertarian", "moderate", "other"],
        },
        voice: {
          type: "string",
          description: "1-2 sentence speaking style.",
        },
        leanings: {
          type: "array",
          items: { type: "string" },
          description:
            "3 leanings or convictions the persona brings to the deliberation, written as third-person sentences.",
        },
      },
      required: [
        "name",
        "slug",
        "description",
        "demographic",
        "politicalAffiliation",
        "voice",
        "leanings",
      ],
      additionalProperties: false,
    },
  },
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await auth.getCurrentUser(request)
  if (!user?.isAdmin) throw new Response("Unauthorized", { status: 401 })

  const body = (await request.json()) as {
    brief?: string
    politicalAffiliation?: PoliticalAffiliation
  }
  const brief = body.brief?.trim() ?? ""
  const wantedAffiliation = body.politicalAffiliation

  const sys = `You author concise persona specs for a values-deliberation simulator. Personas are believable individuals from real American life. Avoid stereotypes; aim for specificity (a job, a town, a relationship). Their leanings should be substantive convictions, not slogans.`

  const userMsg = `Generate one persona${
    wantedAffiliation
      ? ` with politicalAffiliation = "${wantedAffiliation}"`
      : ""
  }.${brief ? `\n\nBrief from the user:\n${brief}` : ""}`

  const params: any = {
    model: MODEL,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: userMsg },
    ],
    tools: [TOOL],
    tool_choice: { type: "function", function: { name: "create_persona" } },
  }
  if (IS_REASONING) params.reasoning_effort = "minimal"
  else params.temperature = 0.9

  const resp = await openai.chat.completions.create(params)
  const call = resp.choices[0]?.message?.tool_calls?.[0]
  if (!call || call.type !== "function") {
    return json({ error: "Generator returned no tool call" }, { status: 500 })
  }
  const persona = JSON.parse(call.function.arguments) as Persona
  return json({ persona })
}
