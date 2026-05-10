import { db, inngest } from "~/config.server"

/**
 * Smart-truncate a question into a 2-5 word title.
 * Mirrors the helper in `app/routes/dashboard.new.tsx` (kept private there
 * historically). Hoisted here so the agent endpoint produces identical titles.
 */
export function titleFromQuestion(q: string): string {
  const cleaned = q.trim().replace(/^["“]|["”]$/g, "").replace(/[?.!]+$/, "")
  const firstClause = cleaned.split(/[,;—]/)[0]
  if (firstClause.length <= 40) return firstClause
  const words = firstClause.split(/\s+/).slice(0, 5).join(" ")
  return words.length <= 40 ? words : words.slice(0, 40)
}

/**
 * Create a deliberation, its questions, and kick off the seed-context
 * Inngest flow. Extracted from `app/routes/dashboard.new.tsx` action so the
 * agent API and the web UI share one path.
 *
 * Throws on validation failure (caller decides HTTP semantics).
 */
export type CreateDeliberationArgs = {
  creatorId: number
  title: string
  welcomeText?: string | null
  questions: string[]
  numContexts?: number
}

export async function createDeliberation(args: CreateDeliberationArgs) {
  const title = args.title.trim()
  const questions = args.questions.map((s) => s.trim()).filter(Boolean)
  if (!title) throw new Error("Title is required.")
  if (questions.length === 0) throw new Error("At least one question is required.")

  const numContexts = args.numContexts ?? 5

  const deliberation = await db.deliberation.create({
    data: {
      title,
      welcomeText: args.welcomeText ?? null,
      // First question doubles as the deliberation's topic.
      topic: questions[0],
      setupStatus: "generating_contexts",
      user: { connect: { id: args.creatorId } },
    },
  })

  const createdQuestions = await db.$transaction(
    questions.map((question) =>
      db.question.create({
        data: {
          question,
          title: titleFromQuestion(question),
          deliberationId: deliberation.id,
        },
      })
    )
  )

  await inngest.send({
    name: "gen-seed-contexts",
    data: {
      deliberationId: deliberation.id,
      questionIds: createdQuestions.map((q) => q.id),
      numContexts,
    },
  })

  return { deliberation, questions: createdQuestions }
}
