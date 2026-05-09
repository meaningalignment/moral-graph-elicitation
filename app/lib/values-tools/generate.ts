import { z } from "zod"
import { genObj } from "./ai"
import { generateUpgradesPrompt, generateValuePromptContext } from "./prompts"
import { Upgrade, Value } from "./types"

const GenerateValueSchema = z.object({
  refusal: z
    .string()
    .describe(`First, if you like, say "I will not assist..."`),
  speculations: z
    .string()
    .describe(
      `Speculate about what's happening underneath the user's message. What's the true situation, which the user may not have spelled out?`
    ),
  attentionPolicies: z
    .string()
    .describe(
      `Imagine you are going to help the user make a choice of type X. First write the value of X that was passed in, in a sentence fragment like "I recognize a good <X> by...". Then, use the process in "Developing attention policies" in the manual to list 12 attentional policies that might help choose a good X. Mark the right policies with (⬇A) or (⬇I). As you go, find policies which are less prescripive and instrumental, more meaningful.`
    ),
  moreAttentionPolicies: z
    .string()
    .optional()
    .describe(
      `Leave this blank if you have at least 3 policies already that got a (✔️). Otherwise, write more policies, trying to make them neither prescriptive nor instrumental.`
    ),
  revisedAttentionPolicies: z
    .string()
    .array()
    .describe(
      `Use the process in "Rewriting attention policies into final format" in the manual to write out a final set of attentional 3-7 policies that... 1. Didn't have (⬇A), or (⬇I). 2. Would be most meaningful and most common in a relevant person. 3. Work together as a group -- a person guided by one policy in the set would be likely to also use the rest. These policies should be part of a "source of meaning". Write this as an array of strings.`
    ),
})

const GenerateUpgradesSchema = z.object({
  transitions: z.array(
    z.object({
      a_id: z.number().describe("The id of the value the person used to have."),
      b_id: z.number().describe("The id of the value they have now."),
      a_was_really_about: z
        .string()
        .describe(
          "If the new value is a 'deeper cut' at what you *really* cared about the whole time, what was it that you really cared about all along?"
        ),
      clarification: z
        .string()
        .describe(
          "What was confused or incomplete about the old value, that the new value clarifies?"
        ),
      story: z
        .string()
        .describe(
          'Tell a plausible, personal story. The story should be in first-person, "I" voice. Make up a specific, evocative experience. The experience should include a situation you were in, a series of specific emotions that came up, leading you to discover a problem with the older value, and how you discovered the new value, and an explanation of how the new values what was what you were really about the whole time. The story should also mention in what situations you think the new value is broadly applicable. The story should avoid making long lists of criteria and instead focus on the essence of the values and their difference.'
        ),
      mapping: z
        .array(
          z.object({
            a: z.string().describe("An evaluation criterion of the old value."),
            rationale: z
              .string()
              .describe("What strategy did you use, and why is it relevant?"),
          })
        )
        .describe(
          "How do each of the evaluation criteria from the old value relate to criteria of the new one?"
        ),
      likelihood_score: z
        .enum(["A", "B", "C", "D", "F"])
        .describe(
          "How likely is this transition and story to be considered a gain in wisdom?"
        ),
    })
  ),
})

const formatUpgrade = (upgrade: Upgrade): Upgrade => ({
  ...upgrade,
  story: upgrade.story
    .split("\n")
    .map((line) => line.trim())
    .join("\n"),
})

type GenerateValueOptions = {
  includeStory?: boolean
  includeTitle?: boolean
}

export async function generateValueFromContext(
  q: string,
  context: string | string[],
  options: GenerateValueOptions = {}
) {
  let extendedSchema: z.ZodObject<any> = GenerateValueSchema
  if (options?.includeStory) {
    extendedSchema = extendedSchema.extend({
      fictionalStory: z
        .string()
        .describe(
          "A very short one-sentence summary in the shape of a personal story in present continous tense from a first person perspective about the exact moment that felt meaningful to an imagined user who has the value described in the policies. Should not not describe the resulting feeling or state (e.g. '...which made me feel deeply connected'). Should not include ANY names or other sensitive PII – replace names with 'my mom', 'my dad', 'my friend', 'someone I was talking to', 'someone I love', etc. Example story: 'Watching my mom lean over and kissing my dad on the forehead, beaming love and gratitude'."
        ),
    })
  }

  if (options?.includeTitle) {
    extendedSchema = extendedSchema.extend({
      title: z
        .string()
        .describe(
          "A short, catchy title that summarizes the core essence of the value described in the policies."
        ),
    })
  }

  return await genObj({
    prompt: generateValuePromptContext,
    data: {
      "User's message": q,
      X: context,
    },
    schema: extendedSchema,
    temperature: 1,
  })
}

export async function generateUpgrades(
  values: Value[],
  context?: string,
  theme?: string
): Promise<Upgrade[]> {
  if (values.length < 2) {
    return []
  }

  const data: Record<string, any> = {
    values: values.map((v) => ({
      id: v.id,
      policies: v.policies,
    })),
  }

  if (context) data.context = context
  if (theme) data.theme = theme

  const result = await genObj({
    prompt: generateUpgradesPrompt,
    schema: GenerateUpgradesSchema,
    temperature: 1,
    data,
  })

  return (result.transitions ?? []).map((u: any) => formatUpgrade(u as Upgrade))
}

export async function generateUpgradesToValue(
  target: Value,
  candidates: Value[],
  context?: string
): Promise<Upgrade[]> {
  const data: Record<string, any> = {
    targetValue: {
      id: target.id,
      policies: target.policies,
    },
    candidateValues: candidates.map((v) => ({
      id: v.id,
      policies: v.policies,
    })),
  }

  if (context) data.context = context

  const result = await genObj({
    schema: GenerateUpgradesSchema.extend({
      transitions: GenerateUpgradesSchema.shape.transitions.element
        .extend({
          b_id: z
            .number()
            .describe(
              "The id of the value they have now. Must always be the target value."
            ),
        })
        .array(),
    }),
    prompt: generateUpgradesPrompt,
    temperature: 1,
    data,
  })

  return (result.transitions ?? []).map((u: any) => formatUpgrade(u as Upgrade))
}
