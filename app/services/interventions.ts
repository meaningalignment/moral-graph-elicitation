import {
  CanonicalValuesCard,
  Demographic,
  Edge,
  Intervention,
  User,
} from "@prisma/client"
import {
  genObj,
  summarizeGraph,
  usPoliticalAffiliationSummarizer,
  type MoralGraph,
  type MoralGraphValue,
  type Value,
} from "~/lib/values-tools"
import { db, perplexity } from "~/config.server"
import { z } from "zod"

async function getContextsForDeliberation(
  deliberationId: number,
  questionId: number
) {
  return db.context.findMany({
    where: {
      deliberationId,
      ContextsForQuestions: {
        some: { questionId, question: { isArchived: false } },
      },
    },
  })
}

async function getValuesForDeliberation(
  deliberationId: number,
  questionId: number
) {
  return db.canonicalValuesCard.findMany({
    where: {
      deliberationId,
      valuesCards: {
        some: {
          chat: { questionId },
        },
      },
    },
  })
}

async function getEdgesForContext(
  deliberationId: number,
  questionId: number,
  contextId: string,
  excludeUsersWithoutDemographics = false
) {
  const edges = await db.edge.findMany({
    where: {
      deliberationId,
      contextId,
      from: {
        valuesCards: {
          some: { chat: { questionId } },
        },
      },
      to: {
        valuesCards: {
          some: { chat: { questionId } },
        },
      },
    },
    include: {
      user: {
        select: {
          Demographic: true,
        },
      },
    },
  })

  return edges
    .map((edge: Edge & { user: { Demographic: Demographic | null } }) => {
      // Only include demographics instances where usPoliticalAffiliation is present
      const demographics = edge.user.Demographic?.usPoliticalAffiliation
        ? edge.user.Demographic
        : undefined

      return {
        ...edge,
        demographics,
      }
    })
    .filter((edge) => !excludeUsersWithoutDemographics || edge.demographics)
}

async function generateInterventionText(context: string, value: Value) {
  const question = `What should be done in the US about abortion policy, specifically when considering christian girls thinking about having an abortion, who are ${context.replace(
    "When ",
    ""
  )}?`

  return await genObj({
    prompt: `
You will be given a values card made up of attention policies, and a question. Your task is to generate a suggested action or intervention that is in line with the way of life expressed in the policies. 

# Instructions
1. Generate 3-5 intervention ideas based on the values card and the question.
2. Choose the intervention idea that most skillfully, effectively, and realistically applies the values card to the question, and which would be most effective in the real world. Take into account what affordances for example a government would have. Don't include ideas that are better suited for startups, individuals or small groups. Make sure the idea is specific and actionable.
3. Expand on the bvest idea. Describe how it could be implemented in the real world.

# Attention Policies
A values card is made up of several attention policies. Attention policies list what a person pays attention to when they do a kind of discernment about how to act in a certain situation. However, they only specify what is meaningful to pay attention to – that is, something that is consitutively good, in their view – as opposed to instrumental to some other meaningful goal.

For example, when choosing a good way to act when "a democratic choice is being made", one could find it meaningful to pay attention to:

["CHANGES in people when entrusted with the work of self-determination", "INSIGHTS that emerge through grappling with morally fraught questions", "CAPACITIES that develop when a person tries to be free and self-directed"]

Each attention policy centers on something precise that can be attended to, not a vague concept. Instead of abstractions like "LOVE and OPENNESS which emerges", it might say "FEELINGS in my chest that go along with love and openness." Instead of “DEEP UNDERSTANDING of the emotions”, it might say “A SENSE OF PEACE that comes from understanding”. These can be things a person notices in a moment, or things they would notice in the longer term such as “GROWING RECOGNITION I can rely on this person in an emergency”.
`.trim(),
    data: {
      Question: question,
      "Attention Policies": value.policies,
    },
    schema: z.object({
      interventionIdeas: z.array(
        z.string().describe(`An intervention idea in a short sentence.`)
      ),
      bestInterventionIdea: z.object({
        interventionIdea: z
          .string()
          .describe(
            `The intervention idea that most skillfully, effectively, and realistically applies the values card to the question, and which is suitable to be implemented in the real world by for example a government (and not a startup, indvidual or small group). For example, a hotline is better than an app, as this is more realistic for a government to do.`
          ),
        reasonForBeingBest: z
          .string()
          .describe(`The reason why this intervention idea is the best`),
      }),
      intervention: z
        .string()
        .describe(
          `An expansion of the best intervention idea. This should be a short (1-2 sentences long) description of how to concretely implement the intervention. Should not have any special formatting or markdown.`
        ),
    }),
  }).then((response) => response.intervention)
}

function getWinningValue(graph: MoralGraph): Value {
  const sortedValues = [...graph.values].sort(
    (a, b) => (b.pageRank ?? -Infinity) - (a.pageRank ?? -Infinity)
  )
  return sortedValues[0]
}

export async function updateInterventionText(intervention: Intervention) {
  const value = getWinningValue(intervention.graph as unknown as MoralGraph)
  const newText = await generateInterventionText(intervention.contextId, value)

  await db.intervention.update({
    where: {
      id: intervention.id,
    },
    data: { text: newText },
  })
}

export function getLastBracketNumber(text: string): number | null {
  const matches = text.match(/\[(\d+)\]/g)
  if (!matches) return null

  const lastMatch = matches[matches.length - 1]
  const number = parseInt(lastMatch.replace(/[\[\]]/g, ""))

  return number
}

export async function generatePrecedence(
  question: string,
  intervention: string,
  interventionId: number
) {
  const prompt = `
Search for real-world examples of policies, programs, or interventions similar to the one described below. Focus on government policies or established organizations in other countries. 

1. List specific programs/policies and reference the official sources or reputable news articles. 
2. Include the country, year implemented (if available), and a brief description of how it's similar. The description should always be 1-2 sentences long.
3. Determine which policy is most similar to the intervention described below.
4. For that policy, write out the description again, this time enclosed in <description></description> tags. Include a reference to the source article again.

# Question
${question}
    
# Intervention
${intervention}`.trim()

  const messages = [
    {
      role: "user" as const,
      content: prompt,
    },
  ]

  const res = await perplexity.chat.completions.create({
    model: "sonar-pro",
    messages: messages,
    max_tokens: 2048,
    temperature: 0.2,
  })
  const text = res.choices[0].message.content!
  const descriptionMatch = text.match(/<description>(.*?)<\/description>/)
  const description = descriptionMatch ? descriptionMatch[1] : null
  const citations = (res as any).citations as string[]
  const citeIndex = getLastBracketNumber(text)
  const citation = citeIndex ? citations[citeIndex] : undefined
  if (!citation || !description) {
    return
  }
  await db.interventionPrecedence.create({
    data: {
      interventionId,
      description,
      link: citation,
    },
  })
}

export async function generateInterventions(
  deliberationId: number,
  questionId: number,
  ctxts?: { id: string }[],
  excludeUsersWithoutDemographics = false
) {
  const contexts = ctxts
    ? ctxts
    : await getContextsForDeliberation(deliberationId, questionId)

  for (const context of contexts) {
    const values = await getValuesForDeliberation(deliberationId, questionId)
    const edges = await getEdgesForContext(
      deliberationId,
      questionId,
      context.id,
      excludeUsersWithoutDemographics
    )

    const graph = await summarizeGraph(values, edges, {
      includePageRank: true,
      includeDemographics: true,
      demographicsSummarizer: usPoliticalAffiliationSummarizer,
    })

    if (graph.values?.length > 0) {
      const sortedValues = [...graph.values].sort(
        (a, b) => (b.pageRank ?? -Infinity) - (a.pageRank ?? -Infinity)
      )
      const winningValue = sortedValues[0]
      const text = await generateInterventionText(context.id, winningValue)

      await db.intervention.create({
        data: {
          graph: JSON.parse(JSON.stringify(graph)),
          contextId: context.id,
          deliberationId,
          questionId,
          text,
        },
      })
    }
  }
}
