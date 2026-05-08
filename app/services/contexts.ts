import { deduplicateContexts, embedText, genObj } from "values-tools"
import { z } from "zod"
import { db, inngest } from "~/config.server"
import { searchSimilarContexts } from "./deduplication"
import { embedContext } from "./embedding"
import generateContextsPrompt from '~/services/prompts/generate-contexts-prompt.md?raw' with { type: "text" }

async function generateContextsFromTranscript(
  transcript: { role: "user" | "assistant"; content: string }[],
  numContexts = 5
) {
  return genObj({
    prompt: generateContextsPrompt,
    data: { transcript },
    schema: z.object({
      factors: z
        .array(
          z.object({
            situationalContext: z
              .string()
              .describe(
                `Describe in 1-2 sentences an aspect of the situation that that affects what's wise to do with regards to the user's situation.`
              ),
            factor: z
              .string()
              .describe(
                `The factor from the situational context, in as few words as possible. For example, "The little girl is in distress". Should be phrased in a way such that it is possible to append it to the words: "What's wise to do when ...".`
              ),
            generalizedFactor: z
              .string()
              .describe(
                `The factor where any unnecessary information is removed, but the meaning is preserved. For example, "The little girl is in distress" could be generalized as "A person is in distress". The fact that she is a girl does not change the values one should approach the distress with. However, don't generalize away detail that do change the values one should approach the question with. For example, "The girl considering an abortion is a christian" should not be generalized to "A religious person is considering an abortion". The fact that she is a christian is relevant, as the christian faith has specific views on abortion.`
              ),
          })
        )
        .describe(
          `${numContexts} of the most important factors of the situation the user is in.`
        ),
    }),
  }).then((res) => res.factors.map((f) => f.generalizedFactor))
}

export async function findDuplicateContext(
  deliberationId: number,
  context: string
): Promise<string | null> {
  // Get similar contexts from DB
  const embedding = await embedText(context)
  const similarContexts = await searchSimilarContexts(deliberationId, embedding)
  if (!similarContexts.length) return null

  // If there's a near identical context, don't use our prompt unnecessarily.
  const nearIdenticalContext = similarContexts.find((c) => c._distance < 0.01)
  if (nearIdenticalContext) {
    return nearIdenticalContext.id
  }

  // Check if any similar contexts are duplicates
  const deduped = await deduplicateContexts([
    context,
    ...similarContexts.map((c) => c.id),
  ])

  // Find first duplicate
  const duplicate = deduped
    .find((group) => group.length > 1 && group.includes(context))
    ?.find((c) => c !== context)
  if (!duplicate) return null

  // Return the duplicate context
  return similarContexts.find((c) => c.id === duplicate)?.id ?? null
}

export const findNewContexts = inngest.createFunction(
  { id: "find-new-contexts", triggers: { event: "find-new-contexts" } },
  async ({ event, step, logger }) => {
    logger.info(`Starting graph generation for deliberation`)

    const deliberationId = event.data.deliberationId as number
    const chatId = event.data.chatId as string

    const chat = await step.run("Fetching chat transcript", async () =>
      db.chat.findUnique({
        where: { id: chatId, deliberationId },
        include: {
          ValuesCard: true,
        },
      })
    )
    if (!chat || !chat.transcript || !chat.ValuesCard) {
      return { message: "Chat transcript or values card not found" }
    }

    const questionId = chat.questionId
    const transcript = (chat.transcript as any[])
      .filter((t) => t.role === "user" || t.role === "assistant")
      .map((t) => ({ role: t.role, content: t.content }))

    // Generate contexts from transcript
    const contexts = await step.run(
      "Generating contexts from transcript",
      async () => generateContextsFromTranscript(transcript)
    )

    // For each context, see if any duplicates already exist in db.
    const duplicates = await step.run("Finding duplicate contexts", async () =>
      Promise.all(contexts.map((c) => findDuplicateContext(deliberationId, c)))
    )

    await step.run("Creating or linking contexts", async () =>
      Promise.all(
        duplicates.map(async (duplicate, i) => {
          if (!duplicate) {
            // We're dealing with a new context! Create it, embed it, and link it to the question.
            logger.info(`Creating new context: ${contexts[i]}`)
            const context = await db.context.create({
              data: {
                id: contexts[i],
                deliberationId,
                createdInChatId: chatId,
                ContextsForQuestions: {
                  create: { questionId },
                },
              },
            })
            await embedContext(context.id)
          } else {
            // Duplicate context already exist in the deliberation! However, it could be from a different question. Link it to the current question (if not already linked).
            logger.info(
              `Linking context ${contexts[i]} to question ${questionId}`
            )
            await db.contextsForQuestions.update({
              where: {
                contextId_questionId_deliberationId: {
                  contextId: duplicate,
                  deliberationId,
                  questionId,
                },
              },
              data: { contextId: duplicate },
            })
          }
        })
      )
    )

    const message = `Added ${
      duplicates.filter((d) => d === null).length
    } new contexts to the question.`
    logger.info(message)
    return { message }
  }
)
