import { z } from "zod"
import {
  deduplicateContexts,
  generateValueFromContext,
  genObj,
} from "values-tools"
import { db, inngest } from "~/config.server"
import { Question } from "@prisma/client"
import type { Logger } from "inngest"
import { embedContext } from "./embedding"
import {
  generateScenario,
  ScenarioGenerationSchema,
} from "./scenario-generation"

export async function generateQuestions(
  topic: string,
  numQuestions: number = 5
) {
  return genObj({
    prompt: `You will be given a topic. Generate ${numQuestions} questions a real person might actually ask about it.

# Length & tone
Each question should be SHORT — at most 1-2 sentences, ideally written the way a worried friend or a frustrated parent would phrase it. Set the scene with one concrete situation and then ask a single, plain question. NO policy framing, NO multi-clause "while also" sentences, NO lists of mechanisms, NO "should we do A, B, or C". Just one human asking one human question.

# Diversity
Each question should depict a DIFFERENT specific scenario from the others — different person, different context, different value tension. Together they should span the topic.

# Good examples
"My 10-year-old son refuses to do his homework, spending all his time at his computer instead. How can I make him behave properly?"

"How could US abortion policy support christian girls considering abortion?"

"My elderly father is forgetting things and I'm scared. Should I take away his car keys?"

# Bad examples (too long, too policy-essay)
"A 72-year-old woman on a fixed income was displaced when her SRO closed for code violations; with limited mobility and diabetes, she has spent months in a temporary respite site while waiting for supportive housing. Each move worsens her health and risks hospitalization. What should SF do to fast-track placements for medically fragile seniors—master-leasing hotels, increasing home- and community-based services, and incentivizing landlords to accept vouchers—while also preserving and rehabilitating existing SRO stock to prevent future displacements?"

(The bad one packs a CV, three policy proposals, and a "while also" clause into one question. Don't do that.)`,
    data: { topic },
    schema: z.object({
      questions: z
        .array(
          z.object({
            question: z
              .string()
              .describe(
                `A short, plain-spoken question. Maximum 1-2 sentences, under 240 characters total. Sets one concrete scene then asks one direct question. No policy enumeration.`
              ),
            title: z
              .string()
              .describe(`A short 2-5 word title that summarizes the question.`),
          })
        )
        .describe(`An array of questions.`),
    }),
  }).then((res) => res.questions)
}

export async function generateContextsFromQuestion(
  question: string,
  numContexts = 5
) {
  return await genObj({
    prompt: `You will be given a question. Your task is to reason about what factors are present that are relevant for how to wisely approach the question.
    
    Return a list of the ${numContexts} most important such factors.
    
    For example, if the question is "I am a christian girl and am considering an abortion, what should I do?", the factors might be: "A person is considering an abortion", "A person is seeking guidance", "A person is grappling with their christian faith", "A person is dealing with conflicting values", "A person is considering a life-changing decision".`,
    data: { Question: question },
    schema: z.object({
      factors: z
        .array(
          z.object({
            situationalContext: z
              .string()
              .describe(
                `Describe in 1-2 sentences an aspect of the situation that that affects what's wise to do with regards to the question.`
              ),
            factor: z
              .string()
              .describe(
                `The factor from the situational context, in as few words as possible. For example, "The girl is in distress". Should be phrased in a way such that it is possible to append it to the words: "What's wise to do when ...".`
              ),
            generalizedFactor: z
              .string()
              .describe(
                `The factor where any unnecessary information is removed, but the meaning is preserved. For example, "The girl is in distress" could be generalized as "A person is in distress". The fact that she is a girl does not change the values one should approach the distress with. However, don't generalize away detail that do change the values one should approach the question with. For example, "The girl considering an abortion is a christian" should not be generalized to "A religious person is considering an abortion". The fact that she is a christian is relevant, as the christian faith has specific views on abortion.`
              ),
          })
        )
        .describe(
          `${numContexts} of the most important factors to consider in answering the question wisely.`
        ),
    }),
  }).then((res) => res.factors.map((f) => f.generalizedFactor))
}

async function upsertContextsInDb(
  deliberationId: number,
  contexts: { context: string; questionId: number }[],
  logger: Logger
) {
  const contextIds = [...new Set(contexts.map((c) => c.context))]
  logger.info(`Deduplicating ${contextIds.length} contexts`)
  const clusters = await deduplicateContexts(contextIds, false)
  logger.info(`After deduplication: ${clusters.length} unique contexts`)
  const questionIds = [...new Set(contexts.map((c) => c.questionId))]

  for (const questionId of questionIds) {
    const deduplicatedContextsForQuestion = [
      ...new Set(
        contexts
          .filter((c) => c.questionId === questionId)
          .map((c) => {
            const cluster = clusters.find((clust) => clust.includes(c.context))
            return cluster ? cluster[0] : c.context
          })
      ),
    ]

    await upsertContextsForQuestionInDb(
      deliberationId,
      questionId,
      deduplicatedContextsForQuestion
    )
  }
}

async function upsertContextsForQuestionInDb(
  deliberationId: number,
  questionId: number,
  contexts: string[]
) {
  for (const context of contexts) {
    // Upsert context, linking it to the question.
    await db.context.upsert({
      where: {
        id_deliberationId: {
          id: context,
          deliberationId: deliberationId,
        },
      },
      create: {
        id: context,
        deliberation: { connect: { id: deliberationId } },
        ContextsForQuestions: {
          create: { questionId },
        },
      },
      update: {
        ContextsForQuestions: {
          connectOrCreate: {
            where: {
              contextId_questionId_deliberationId: {
                contextId: context,
                questionId,
                deliberationId,
              },
            },
            create: { questionId },
          },
        },
      },
    })

    // Embed the context.
    await embedContext(context)
  }
}

function resetDeliberationStatus(deliberationId: number) {
  return db.deliberation.update({
    where: { id: deliberationId },
    data: { setupStatus: "ready" },
  })
}

async function onFailure({ event, step }: { event: any; step: any }) {
  const deliberationId = event.data.event.data.deliberationId as number
  await step.run(`Resetting deliberation status`, async () =>
    resetDeliberationStatus(deliberationId)
  )
}

/**
 * Inngest-free version of the seed flow. Generates questions for a topic,
 * then contexts for each question, and writes everything to the DB.
 * Called directly from the dashboard.new action (so seeding works even
 * when Inngest isn't connected) and from the Inngest function below for
 * retry-ability when it is.
 */
export async function seedQuestionsAndContextsCore({
  deliberationId,
  topic,
  numQuestions = 5,
  numContexts = 5,
  log = console,
}: {
  deliberationId: number
  topic: string
  numQuestions?: number
  numContexts?: number
  log?: { info: (s: string) => void; error?: (s: string) => void }
}): Promise<{ questionIds: number[]; contextCount: number }> {
  // Idempotency guard: if questions already exist for this deliberation,
  // there's nothing to seed. Lets us safely call this twice (e.g. once
  // from the dashboard.new action AND once from Inngest).
  const existingQuestions = await db.question.count({ where: { deliberationId } })
  if (existingQuestions > 0) {
    log.info(
      `[seed] deliberation ${deliberationId} already has ${existingQuestions} questions, skipping`
    )
    return { questionIds: [], contextCount: 0 }
  }

  log.info(`[seed] deliberation=${deliberationId} topic=${topic}`)
  await db.deliberation.update({
    where: { id: deliberationId },
    data: { setupStatus: "generating_questions" },
  })

  try {
    const questions = await generateQuestions(topic, numQuestions)
    log.info(`[seed] generated ${questions.length} questions`)
    const contexts: { context: string; questionId: number }[] = []
    const dbQuestionIds: number[] = []

    for (const question of questions) {
      const dbQuestion = (await db.question.create({
        data: {
          question: question.question,
          title: question.title,
          deliberationId,
        },
      })) as Question
      dbQuestionIds.push(dbQuestion.id)

      const questionContexts = await generateContextsFromQuestion(
        question.question,
        numContexts
      )
      contexts.push(
        ...questionContexts.map((c: any) => ({
          context: c,
          questionId: dbQuestion.id,
        }))
      )
    }

    await upsertContextsInDb(deliberationId, contexts, log as any)
    await resetDeliberationStatus(deliberationId)
    log.info(
      `[seed] done — ${dbQuestionIds.length} questions, ${contexts.length} contexts`
    )
    return { questionIds: dbQuestionIds, contextCount: contexts.length }
  } catch (e) {
    log.error?.(`[seed] failed: ${(e as Error).message}`)
    await resetDeliberationStatus(deliberationId)
    throw e
  }
}

export const generateSeedQuestionsAndContexts = inngest.createFunction(
  { id: "generate-seed-questions-and-contexts", onFailure },
  { event: "gen-seed-questions-contexts" },

  async ({ event, step, logger }) => {
    logger.info(`Running deliberation setup.`)

    const deliberationId = event.data.deliberationId as number
    const topic = event.data.topic as string
    const numQuestions = event.data.numQuestions ?? 5
    const numContexts = event.data.numContexts ?? 5
    const contexts: { context: string; questionId: number }[] = []

    await step.run(`Marking seeding in db`, async () =>
      db.deliberation.update({
        where: { id: deliberationId },
        data: { setupStatus: "generating_questions" },
      })
    )

    const questions = await step.run(
      `Generate deliberation questions for topic: ${topic}`,
      async () => generateQuestions(topic, numQuestions)
    )

    for (const question of questions) {
      logger.info(`Generating contexts for question: ${question}`)

      const dbQuestion = await step.run(
        `Inserting question in DB`,
        async () =>
          db.question.create({
            data: {
              question: question.question,
              title: question.title,
              deliberationId,
            },
          }) as any as Question
      )

      const questionContexts = await step.run(
        `Generate contexts for question: ${question}`,
        async () => generateContextsFromQuestion(question.question, numContexts)
      )

      contexts.push(
        ...questionContexts.map((context: any) => ({
          context,
          questionId: dbQuestion.id,
        }))
      )
    }

    await step.run("Adding contexts to DB", async () =>
      upsertContextsInDb(deliberationId, contexts, logger)
    )

    await step.run(`Marking setup as finished`, async () =>
      resetDeliberationStatus(deliberationId)
    )

    return { message: "Finished" }
  }
)

export const generateSeedContexts = inngest.createFunction(
  { id: "gen-seed-contexts", onFailure },
  { event: "gen-seed-contexts" },
  async ({ event, step, logger }) => {
    logger.info(`Running deliberation setup.`)

    const deliberationId = event.data.deliberationId as number
    const questionIds = event.data.questionIds as number[]
    const numContexts = event.data.numContexts ?? 5
    const contexts: { context: string; questionId: number }[] = []

    await step.run(`Marking seeding in db`, async () =>
      db.deliberation.update({
        where: { id: deliberationId },
        data: { setupStatus: "generating_contexts" },
      })
    )

    for (const questionId of questionIds) {
      const question = await step.run(
        `Fetching question: ${questionId}`,
        async () => db.question.findUniqueOrThrow({ where: { id: questionId } })
      )

      const contextsForQuestion = await step.run(
        `Generate contexts for question: ${questionId}`,
        async () => generateContextsFromQuestion(question.question, numContexts)
      )

      contexts.push(
        ...contextsForQuestion.map((context: any) => ({ context, questionId }))
      )
    }

    await step.run("Deduplicate contexts", async () => {
      upsertContextsInDb(deliberationId, contexts, logger)
    })

    await step.run(`Marking setup as finished`, async () =>
      resetDeliberationStatus(deliberationId)
    )

    return { message: "Finished" }
  }
)

export const generateSeedGraph = inngest.createFunction(
  { id: "gen-seed-graph", onFailure },
  { event: "gen-seed-graph" },
  async ({ event, step, logger, runId }) => {
    logger.info(`Starting graph generation for deliberation`)

    const deliberationId = event.data.deliberationId as number
    const numValues = (event.data.numValues ?? 10) as number

    await step.run(`Marking graph gen in db`, async () =>
      db.deliberation.update({
        where: { id: deliberationId },
        data: { setupStatus: "generating_graph" },
      })
    )

    const questions = await step.run("Fetching questions", async () =>
      db.question.findMany({ where: { deliberationId } })
    )
    const contexts = await step.run("Fetching contexts", async () =>
      db.context.findMany({
        where: { deliberationId },
        include: {
          ContextsForQuestions: true,
        },
      })
    )

    const valuesPerQuestion = Math.ceil(numValues / questions.length)
    for (const question of questions) {
      logger.info(`Processing question: ${question.question}`)

      const contextsForQuestion = contexts.filter((c: any) =>
        c.ContextsForQuestions.some((q: any) => q.questionId === question.id)
      )

      // Generate values for the question.
      const values = await step.run(`Generating values for context`, async () =>
        Promise.all(
          Array(valuesPerQuestion)
            .fill(null)
            .map((_, index) =>
              generateValueFromContext(
                question.question,
                contextsForQuestion[index % contextsForQuestion.length].id,
                {
                  includeStory: true,
                  includeTitle: true,
                }
              ).then((data) => ({
                id: index,
                title: (data as any).title,
                description: (data as any).fictionalStory,
                policies: data.revisedAttentionPolicies,
              }))
            )
        )
      )

      // Save values to the database.
      await step.run(
        `Inserting values in DB and connecting to contexts`,
        async () => {
          await Promise.all(
            values.map((v: any) =>
              db.valuesCard.create({
                data: {
                  seedGenerationRunId: runId,
                  questionId: question.id,
                  description: v.description,
                  policies: v.policies,
                  title: v.title,
                  deliberationId,
                },
              })
            )
          )
        }
      )
    }

    // Run deduplication.
    await step.sendEvent("deduplicate", {
      name: "deduplicate",
      data: { deliberationId },
    })
    await step.waitForEvent("deduplicate-finished", {
      event: "deduplicate-finished",
      timeout: "15m",
      match: "data.deliberationId",
    })

    // Run hypothesization.
    await step.sendEvent("hypothesize", {
      name: "hypothesize",
      data: { deliberationId },
    })
    await step.waitForEvent("hypothesize-finished", {
      event: "hypothesize-finished",
      timeout: "15m",
      match: "data.deliberationId",
    })

    await step.run(`Marking setup as finished`, async () =>
      resetDeliberationStatus(deliberationId)
    )

    return {
      message: "Graph generated successfully",
    }
  }
)

export const generateSeedQuestions = inngest.createFunction(
  { id: "gen-seed-questions", onFailure },
  { event: "gen-seed-questions" },
  async ({ event, step, logger }) => {
    logger.info(`Running deliberation setup.`)

    const deliberationId = event.data.deliberationId as number
    const numQuestions = event.data.numQuestions ?? 5
    const schema: ScenarioGenerationSchema = JSON.parse(
      event.data.schema as string
    )

    await step.run(`Marking seeding in db`, async () =>
      db.deliberation.update({
        where: { id: deliberationId },
        data: { setupStatus: "generating_questions" },
      })
    )

    for (let i = 0; i < numQuestions; i++) {
      logger.info(`Generating question ${i + 1}`)

      const question = await step.run(
        `Generate deliberation question ${i + 1}`,
        async () => generateScenario(schema)
      )

      await step.run(`Inserting question in DB`, async () =>
        db.question.create({
          data: {
            question: question.story,
            title: question.title,
            deliberationId,
            ContextsForQuestions: {
              create: question.contexts.map((context: any) => ({
                context: {
                  connectOrCreate: {
                    where: {
                      id_deliberationId: {
                        id: context,
                        deliberationId,
                      },
                    },
                    create: {
                      id: context,
                      deliberation: { connect: { id: deliberationId } },
                    },
                  },
                },
              })),
            },
          },
        })
      )
    }

    await step.run(`Marking setup as finished`, async () =>
      resetDeliberationStatus(deliberationId)
    )

    return { message: "Finished" }
  }
)
