import { genObj } from "~/lib/values-tools"
import { z } from "zod"

export const schema = z.object({
  topic: z.string(),
  categories: z.record(
    z.string(),
    z.object({
      type: z.enum(["single_select", "multi_select"]),
      probability: z.number().min(0).max(1).optional(),
      options: z.array(
        z.object({
          text: z.string(),
          probability: z.number().min(0).max(1),
          description: z.string().optional(),
          redundant: z.boolean().optional(),
          conditions: z
            .array(
              z.object({
                when: z.record(z.string(), z.string()),
                probability: z.number().min(0).max(1),
              })
            )
            .optional(),
        })
      ),
    })
  ),
})

export type ScenarioGenerationSchema = z.infer<typeof schema>

export function parseScenarioGenerationData(
  data: unknown
): ScenarioGenerationSchema | null {
  try {
    return schema.parse(data)
  } catch (error) {
    console.error(error)
    return null
  }
}

export function allContexts(data: ScenarioGenerationSchema): string[] {
  return [
    ...new Set(
      Object.values(data.categories).flatMap((category) =>
        category.options
          .filter((option) => !option.redundant)
          .map((option) => option.text)
      )
    ),
  ]
}

export function getRepresentativeContexts(
  data: ScenarioGenerationSchema
): string[] {
  const selected: string[] = []

  for (const category of Object.values(data.categories)) {
    // Skip if category probability check fails
    if (category.probability && Math.random() > category.probability) continue

    const candidates =
      category.type === "single_select"
        ? [selectRandomOption(category.options)]
        : category.options

    for (const option of candidates) {
      const probability = getEffectiveProbability(option, selected)
      const isRedundant = option.redundant === true
      if (Math.random() <= probability && !isRedundant) {
        selected.push(option.text)
      }
    }
  }

  return selected
}

function getEffectiveProbability(
  option: ScenarioGenerationSchema["categories"][string]["options"][number],
  selectedTexts: string[]
): number {
  if (!option.conditions) return option.probability

  const matchingCondition = option.conditions.find((condition) =>
    Object.entries(condition.when).every(([_, text]) =>
      selectedTexts.includes(text)
    )
  )

  return matchingCondition?.probability ?? option.probability
}

function selectRandomOption<T extends { probability: number }>(
  options: T[]
): T {
  const roll =
    Math.random() * options.reduce((sum, opt) => sum + opt.probability, 0)
  let sum = 0
  return options.find((opt) => (sum += opt.probability) >= roll) ?? options[0]
}

export async function generateScenario(
  schema: ScenarioGenerationSchema,
  selectedContexts?: string[]
): Promise<{ story: string; title: string; contexts: string[] }> {
  const contexts = selectedContexts ?? getRepresentativeContexts(schema)
  const topic = schema.topic

  const result = await genObj({
    prompt: `You will be given a few strings that provide context about a particular situation. Your task is to generate a relatable and touching story depicting someone in that situation, ending in a question about the topic you were given. Make sure the situation you describe is realistic, hint at all the contexts you were given, but make it fairly short. Despite being short, include some detail so it remains vivid and relatable`,
    data: { contexts, topic },
    schema: z.object({
      story: z
        .string()
        .describe(
          `A brief personal story (1-3 sentences) depicting a specific scenario based on the contexts you were given, followed by a question about the topic. The question at the end should be to-the-point, using as few words as possible.`
        ),
      title: z
        .string()
        .describe(`A short 2-5 word title that summarizes the unique story.`),
    }),
  })

  return {
    ...result,
    contexts,
  }
}
