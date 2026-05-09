import { genObj } from "values-tools"
import { z } from "zod"
import { db, inngest } from "~/config.server"
import generateContextsPrompt from "~/services/prompts/generate-contexts-prompt.md?raw" with { type: "text" }

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

/**
 * Match a candidate context string against the existing contexts in a
 * deliberation. Pure prompt — no embeddings, no pre-filtering. The set of
 * existing contexts in any single deliberation is small enough (max a few
 * hundred short strings) to fit in one structured-output call.
 */
export async function findDuplicateContext(
  deliberationId: number,
  context: string
): Promise<string | null> {
  const existing = await db.context.findMany({
    where: { deliberationId },
    select: { id: true },
  })
  if (existing.length === 0) return null

  // Cheap exact-match shortcut, before paying for an LLM call.
  const exact = existing.find((c) => c.id === context)
  if (exact) return exact.id

  const result = await genObj({
    prompt: `You are deduplicating short "When ..." context clauses for a deliberation. Two contexts are duplicates only if they pick out the SAME morally-relevant slice of a situation — same actor, same stake, same tension. Different actors, scopes, or framings make them distinct. Surface vocabulary overlap is not enough.`,
    data: {
      candidate: context,
      existingContexts: existing.map((c) => c.id),
    },
    schema: z.object({
      rationale: z
        .string()
        .describe("1 sentence noting whether the candidate is a duplicate of any existing context, and why."),
      duplicateOf: z
        .string()
        .nullable()
        .describe(
          "The exact existing context string the candidate duplicates, or null if it is a new context."
        ),
    }),
  })
  if (result.duplicateOf === null) return null
  // Defence: model might return a paraphrase rather than an exact id.
  const matched = existing.find((c) => c.id === result.duplicateOf)
  return matched?.id ?? null
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

    // Two LLM-generated contexts in this batch can resolve to the same target
    // id (either identical strings, or different strings the dedupe step maps
    // to the same existing context). Collapse before writing so concurrent
    // upserts in Promise.all don't fight over the same primary key.
    const seen = new Set<string>()
    const writePlan: { isNew: boolean; targetId: string }[] = []
    for (let i = 0; i < contexts.length; i++) {
      const targetId = duplicates[i] ?? contexts[i]
      if (seen.has(targetId)) continue
      seen.add(targetId)
      writePlan.push({ isNew: duplicates[i] === null, targetId })
    }

    await step.run("Creating or linking contexts", async () =>
      Promise.all(
        writePlan.map(async ({ isNew, targetId }) => {
          if (isNew) {
            // We're dealing with a new context! Create it and link it to the question.
            logger.info(`Creating new context: ${targetId}`)
            // Concurrent find-new-contexts runs (one per chat) can race on the
            // same generated context name; upsert keeps that idempotent.
            const context = await db.context.upsert({
              where: {
                id_deliberationId: { id: targetId, deliberationId },
              },
              update: {},
              create: {
                id: targetId,
                deliberationId,
                createdInChatId: chatId,
              },
            })
            await db.contextsForQuestions.upsert({
              where: {
                contextId_questionId_deliberationId: {
                  contextId: context.id,
                  deliberationId,
                  questionId,
                },
              },
              update: {},
              create: {
                contextId: context.id,
                deliberationId,
                questionId,
              },
            })
          } else {
            // Duplicate context already exist in the deliberation! However, it could be from a different question. Link it to the current question (if not already linked).
            logger.info(`Linking context ${targetId} to question ${questionId}`)
            await db.contextsForQuestions.upsert({
              where: {
                contextId_questionId_deliberationId: {
                  contextId: targetId,
                  deliberationId,
                  questionId,
                },
              },
              update: {},
              create: {
                contextId: targetId,
                deliberationId,
                questionId,
              },
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
