import { genObj } from "~/lib/values-tools"
import { z } from "zod"
import { db, inngest } from "~/config.server"
import generateContextsPrompt from "~/services/prompts/generate-contexts-prompt.md?raw" with { type: "text" }

async function generateContextsFromTranscript(
  transcript: { role: "user" | "assistant"; content: string }[],
  existingContexts: string[]
) {
  return genObj({
    prompt: generateContextsPrompt,
    data: { transcript, existingContexts },
    schema: z.object({
      rationale: z
        .string()
        .describe(
          `1-2 sentences: which existing contexts cover the user's situation, and whether anything is genuinely uncovered. Default reasoning is that everything is already covered.`
        ),
      newContexts: z
        .array(
          z
            .string()
            .describe(
              `A short "When ..." clause, 4-9 words, no period. Phrased to complete "What's wise to do ___?". E.g. "When assisting a family facing eviction".`
            )
        )
        .describe(
          `New contexts that are NOT already covered by any existing context. Default to an empty list. Only include a clause when no existing context fits.`
        ),
    }),
  }).then((res) => res.newContexts)
}

/**
 * Match a candidate context string against the existing contexts in a
 * deliberation. Pure prompt — no embeddings, no pre-filtering. The set of
 * existing contexts in any single deliberation is small enough (max a few
 * hundred short strings) to fit in one structured-output call.
 */
export async function findDuplicateContext(
  deliberationId: number,
  context: string,
  existingContexts?: string[]
): Promise<string | null> {
  const existing =
    existingContexts ??
    (
      await db.context.findMany({
        where: { deliberationId },
        select: { id: true },
      })
    ).map((c) => c.id)
  if (existing.length === 0) return null

  // Cheap exact-match shortcut, before paying for an LLM call.
  if (existing.includes(context)) return context

  const result = await genObj({
    prompt: `You are deduplicating short "When ..." context clauses for a deliberation. Two contexts are duplicates only if they pick out the SAME morally-relevant slice of a situation — same actor, same stake, same tension. Different actors, scopes, or framings make them distinct. Surface vocabulary overlap is not enough.`,
    data: {
      candidate: context,
      existingContexts: existing,
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
  return existing.includes(result.duplicateOf) ? result.duplicateOf : null
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

    const existingContexts = await step.run(
      "Loading existing contexts",
      async () =>
        (
          await db.context.findMany({
            where: { deliberationId },
            select: { id: true },
          })
        ).map((c) => c.id)
    )

    // Generate contexts from transcript, biased toward reusing existing ones.
    const contexts = await step.run(
      "Generating contexts from transcript",
      async () => generateContextsFromTranscript(transcript, existingContexts)
    )

    // For each context, see if any duplicates already exist in db. The
    // generation step is reuse-aware, but this is a safety net for the cases
    // where it still surfaces something already covered.
    const duplicates = await step.run("Finding duplicate contexts", async () =>
      Promise.all(
        contexts.map((c) =>
          findDuplicateContext(deliberationId, c, existingContexts)
        )
      )
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
