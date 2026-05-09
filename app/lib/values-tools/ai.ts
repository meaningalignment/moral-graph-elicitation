import { generateObject, generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { z, ZodSchema } from "zod"

// In-repo replacement for values-tools' genObj/genText. OpenAI-only:
// the upstream module always tried to load @ai-sdk/anthropic for some calls
// even when configured for gpt-*, which broke deployments without an
// ANTHROPIC_API_KEY. We don't need anthropic anywhere in this app.

const DEFAULT_MODEL = process.env.VALUES_TOOLS_MODEL ?? "gpt-5"
// gpt-5 / o-series only accept temperature=1; everything else can run hotter.
const DEFAULT_TEMPERATURE = 1

function stringifyObj(obj: any): string {
  return JSON.stringify(
    obj,
    (_key, value) => {
      if (value === "" || value === undefined || value === null) {
        return undefined
      }
      return value
    },
    2
  )
}

function stringifyArray(arr: any[]): string {
  return arr.map(stringifyObj).join("\n\n")
}

function stringify(value: any): string {
  if (Array.isArray(value)) return stringifyArray(value)
  if (typeof value === "string") return value
  return stringifyObj(value)
}

export async function genObj<T extends ZodSchema>({
  prompt,
  data,
  schema,
  model,
  temperature,
  mode = "json",
}: {
  prompt: string
  data: Record<string, any>
  schema: T
  temperature?: number
  model?: string
  /** Retained for API parity with values-tools; cache is not implemented. */
  useCacheIfAvailable?: boolean
  mode?: "json" | "tool"
}): Promise<z.infer<T>> {
  const renderedData = Object.entries(data)
    .map(([key, value]) => `# ${key}\n\n${stringify(value)}`)
    .join("\n\n")

  const finalModel = model ?? DEFAULT_MODEL
  const finalTemperature = temperature ?? DEFAULT_TEMPERATURE

  const { object } = await generateObject({
    model: openai(finalModel),
    schema,
    system: prompt,
    messages: [{ role: "user", content: renderedData }],
    temperature: finalTemperature,
    mode,
  })

  return object
}

export async function genText({
  prompt,
  userMessage,
  model,
  temperature,
}: {
  prompt: string
  userMessage: string
  model?: string
  temperature?: number
  useCacheIfAvailable?: boolean
}): Promise<string> {
  const finalModel = model ?? DEFAULT_MODEL
  const finalTemperature = temperature ?? DEFAULT_TEMPERATURE

  const { text } = await generateText({
    model: openai(finalModel),
    system: prompt,
    messages: [{ role: "user", content: userMessage }],
    temperature: finalTemperature,
  })

  return text
}
