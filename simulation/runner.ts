import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { OpenAI } from "openai"
import { db, openai } from "~/config.server"
import {
  ChatMessage,
  runArticulationTurn,
  persistArticulatedCard,
} from "~/services/articulation/chat"
import { Persona, emailFor } from "./personas/schema"

const TRANSCRIPT_DIR = path.join(process.cwd(), "simulation", "transcripts")
const MAX_PERSONA_TURNS = 10

export type SimulationRunContext = {
  runId: string
  /** Stream NDJSON entries to disk for full debuggability. */
  log: (entry: Record<string, unknown>) => void
  modelVersions: { articulation: string; persona: string }
}

export function createRunContext(runId?: string): SimulationRunContext {
  const id = runId ?? `run-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 6)}`
  const dir = path.join(TRANSCRIPT_DIR, id)
  fs.mkdirSync(dir, { recursive: true })

  const log = (entry: Record<string, unknown>) => {
    const personaSlug = (entry.persona as string) ?? "_run"
    const file = path.join(dir, `${personaSlug}.jsonl`)
    fs.appendFileSync(
      file,
      JSON.stringify({ t: new Date().toISOString(), ...entry }) + "\n"
    )
  }

  return {
    runId: id,
    log,
    modelVersions: {
      articulation: process.env.OPENAI_ARTICULATION_MODEL ?? "gpt-5",
      persona: process.env.SIMULATION_MODEL ?? "gpt-5",
    },
  }
}

function isReasoningModel(model: string) {
  return /^gpt-5|^o\d/.test(model)
}

/**
 * Upsert a User row for this persona, marked role=["SIMULATED"]. We re-use
 * the existing User.role String[] field (schema.prisma:21) so simulated users
 * are filterable everywhere a real user would be.
 */
export async function ensureSimulatedUser(persona: Persona) {
  const email = emailFor(persona)
  return db.user.upsert({
    where: { email },
    update: { role: ["SIMULATED"], name: persona.name },
    create: {
      email,
      name: persona.name,
      role: ["SIMULATED"],
      isAdmin: false,
    },
  })
}

/** The persona-side LLM that responds AS the user. */
async function simulatePersonaReply(args: {
  persona: Persona
  topic: string
  questionTitle: string
  transcript: ChatMessage[]
  ctx: SimulationRunContext
}): Promise<string> {
  const { persona, topic, questionTitle, transcript, ctx } = args
  const systemContent = `You are role-playing as a participant in a values deliberation. Stay in character throughout.

# Persona
Name: ${persona.name}
Demographic: ${persona.demographic}
Voice: ${persona.voice}
Leanings:
${persona.leanings.map((l) => `- ${l}`).join("\n")}

# Deliberation
Topic: ${topic}
Question you chose: ${questionTitle}

You are talking to a "meaning assistant" that wants to help you articulate what you find meaningful about how this question should be navigated. Reply in your voice, in 1-3 sentences. Bring concrete stories or examples from your life when natural. Don't be evasive. If the assistant calls a tool to submit a values card, just respond as a person would: thank them, react, or push back. Do not output structured JSON.`

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    // Flip roles: the articulation assistant's text becomes user-input for our persona,
    // and the user (persona) text becomes assistant-input.
    ...transcript
      .filter((m) => m.role === "user" || m.role === "assistant")
      .filter((m) => typeof m.content === "string" && m.content !== "")
      .map((m) => ({
        role: m.role === "user" ? ("assistant" as const) : ("user" as const),
        content: m.content as string,
      })),
  ]

  const model = persona.model ?? ctx.modelVersions.persona
  const t0 = Date.now()
  const params: any = { model, messages }
  if (isReasoningModel(model)) params.reasoning_effort = "minimal"
  else params.temperature = 0.7
  const resp = await openai.chat.completions.create(params)
  const text = resp.choices[0]?.message?.content?.trim() ?? ""
  ctx.log({
    persona: persona.slug,
    role: "persona-reply",
    durationMs: Date.now() - t0,
    text,
  })
  return text
}

export async function pickQuestionForPersona(args: {
  deliberationId: number
  persona: Persona
  questionId?: number
}): Promise<{ id: number; title: string; question: string }> {
  if (args.questionId) {
    const q = await db.question.findUnique({ where: { id: args.questionId } })
    if (!q) throw new Error(`Question ${args.questionId} not found`)
    return { id: q.id, title: q.title, question: q.question }
  }
  const qs = await db.question.findMany({
    where: { deliberationId: args.deliberationId, isArchived: false },
  })
  if (qs.length === 0) throw new Error(`Deliberation ${args.deliberationId} has no questions`)
  const pref = args.persona.questionPreference?.toLowerCase()
  const match = pref
    ? qs.find(
        (q) =>
          q.title.toLowerCase().includes(pref) ||
          q.question.toLowerCase().includes(pref)
      )
    : undefined
  const chosen = match ?? qs[Math.floor(Math.random() * qs.length)]
  return { id: chosen.id, title: chosen.title, question: chosen.question }
}

/**
 * Drive a full articulation conversation for one persona until the assistant
 * submits a values card (or until the turn budget runs out).
 */
export async function simulatePersonaArticulation(args: {
  persona: Persona
  deliberationId: number
  questionId?: number
  ctx: SimulationRunContext
}): Promise<{
  chatId: string
  cardId: number | null
  turns: number
  submitted: boolean
}> {
  const { persona, deliberationId, ctx } = args
  const user = await ensureSimulatedUser(persona)
  const deliberation = await db.deliberation.findUniqueOrThrow({
    where: { id: deliberationId },
  })
  const question = await pickQuestionForPersona({
    deliberationId,
    persona,
    questionId: args.questionId,
  })
  const threadId = `sim-${ctx.runId}-${persona.slug}`

  let transcript: ChatMessage[] = []
  // Seed: the assistant opens with the question.
  const seed: ChatMessage = { role: "assistant", content: question.question }
  transcript = [seed]

  let submittedCard: import("~/services/articulation/chat").ChatMessage extends never
    ? never
    : Awaited<ReturnType<typeof runArticulationTurn>>["submittedCard"] = undefined
  let turns = 0

  for (turns = 0; turns < MAX_PERSONA_TURNS; turns++) {
    const userText = await simulatePersonaReply({
      persona,
      topic: deliberation.topic,
      questionTitle: question.title,
      transcript,
      ctx,
    })
    if (!userText) break

    const t0 = Date.now()
    const turn = await runArticulationTurn({
      transcript,
      userMessage: userText,
      topic: deliberation.topic,
      questionTitle: question.title,
    })
    ctx.log({
      persona: persona.slug,
      role: "articulation-turn",
      turn: turns,
      durationMs: Date.now() - t0,
      assistantText: turn.assistantText,
      submitted: !!turn.submittedCard,
    })
    transcript = turn.transcript
    if (turn.submittedCard) {
      submittedCard = turn.submittedCard
      break
    }
  }

  let cardId: number | null = null
  if (submittedCard) {
    const evaluation = {
      simulation: {
        runId: ctx.runId,
        persona: persona.slug,
        modelVersions: ctx.modelVersions,
        rationale: `Simulated articulation by persona ${persona.name}`,
      },
    }
    const { valuesCard } = await persistArticulatedCard({
      authorId: user.id,
      threadId,
      deliberationId,
      questionId: question.id,
      transcript,
      card: submittedCard,
      evaluation,
    })
    cardId = valuesCard.id
  } else {
    // Persist whatever transcript we got, marking it incomplete.
    await db.chat.upsert({
      where: { id: threadId },
      create: {
        id: threadId,
        userId: user.id,
        deliberationId,
        questionId: question.id,
        transcript: transcript as any,
        evaluation: {
          simulation: {
            runId: ctx.runId,
            persona: persona.slug,
            modelVersions: ctx.modelVersions,
            rationale: "Articulation did not submit a card within the turn budget",
            incomplete: true,
          },
        } as any,
      },
      update: {
        transcript: transcript as any,
      },
    })
  }

  ctx.log({
    persona: persona.slug,
    role: "articulation-complete",
    chatId: threadId,
    cardId,
    turns: turns + 1,
    submitted: !!submittedCard,
  })

  return { chatId: threadId, cardId, turns: turns + 1, submitted: !!submittedCard }
}

/**
 * Vote on existing edge hypotheses for this deliberation. The persona LLM
 * decides agree/disagree/skip per pair, and we write Edge rows.
 */
export async function castSimulatedEdgeVotes(args: {
  persona: Persona
  deliberationId: number
  ctx: SimulationRunContext
  limit?: number
}): Promise<{ agreed: number; disagreed: number; skipped: number }> {
  const { persona, deliberationId, ctx } = args
  const user = await ensureSimulatedUser(persona)
  const limit = args.limit ?? 10

  const hypotheses = await db.edgeHypothesis.findMany({
    where: { deliberationId, isArchived: false },
    include: { from: true, to: true, context: true },
    take: limit,
  })

  let agreed = 0
  let disagreed = 0
  let skipped = 0

  for (const h of hypotheses) {
    const prompt = `You are role-playing as ${persona.name}.

# Persona
Demographic: ${persona.demographic}
Voice: ${persona.voice}
Leanings:
${persona.leanings.map((l) => `- ${l}`).join("\n")}

# Decision
You are presented with a "wisdom upgrade story" describing how someone might move from one value to another in a particular context. Your task is to decide whether you agree this represents a genuine gain in wisdom for this kind of situation.

## Context
${h.contextId}

## From value
Title: ${h.from?.title}
Description: ${h.from?.description}
Policies: ${(h.from?.policies ?? []).join("; ")}

## To value
Title: ${h.to?.title}
Description: ${h.to?.description}
Policies: ${(h.to?.policies ?? []).join("; ")}

## The upgrade story
${h.story ?? "(no story)"}

Decide: would you, as ${persona.name}, vote that the FROM value upgrading to the TO value reflects increased wisdom in this context?

Respond with ONLY one of: "agree", "disagree", "skip" — followed by a one-sentence reason.`

    const t0 = Date.now()
    const voteModel = persona.model ?? ctx.modelVersions.persona
    const voteParams: any = {
      model: voteModel,
      messages: [{ role: "user", content: prompt }],
    }
    if (isReasoningModel(voteModel)) voteParams.reasoning_effort = "minimal"
    else voteParams.temperature = 0.4
    const resp = await openai.chat.completions.create(voteParams)
    const text = resp.choices[0]?.message?.content?.trim() ?? "skip"
    const verdict = /^agree/i.test(text)
      ? "agree"
      : /^disagree/i.test(text)
      ? "disagree"
      : "skip"

    ctx.log({
      persona: persona.slug,
      role: "vote",
      hypothesis: { fromId: h.fromId, toId: h.toId, contextId: h.contextId },
      verdict,
      durationMs: Date.now() - t0,
      raw: text,
    })

    if (verdict === "skip") {
      skipped++
      continue
    }
    if (verdict === "agree") agreed++
    else disagreed++

    await db.edge.upsert({
      where: {
        userId_fromId_toId: {
          userId: user.id,
          fromId: h.fromId,
          toId: h.toId,
        },
      },
      create: {
        userId: user.id,
        fromId: h.fromId,
        toId: h.toId,
        story: h.story ?? "",
        contextId: h.contextId,
        deliberationId,
        type: verdict === "agree" ? "upgrade" : "no_upgrade",
        comment: text,
      },
      update: {
        type: verdict === "agree" ? "upgrade" : "no_upgrade",
        comment: text,
      },
    })
  }

  return { agreed, disagreed, skipped }
}
