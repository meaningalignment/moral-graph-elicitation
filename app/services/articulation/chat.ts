import { OpenAI } from "openai"
import { db, openai, inngest } from "~/config.server"
import { embedNonCanonicalCard } from "~/services/embedding"
import { kv } from "@vercel/kv"
import {
  ARTICULATION_SYSTEM_PROMPT,
  SUBMIT_VALUES_CARD_TOOL,
  ArticulatedValuesCardDraft,
} from "./prompt"

const DEFAULT_MODEL = process.env.OPENAI_ARTICULATION_MODEL ?? "gpt-5"

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_call_id?: string
  tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[]
  name?: string
}

export type ArticulationTurn = {
  /** New assistant text added to the transcript. May be empty if the assistant
   * went straight to a tool call. */
  assistantText: string
  /** The full updated transcript including the user message, assistant text,
   * and any tool messages. */
  transcript: ChatMessage[]
  /** Set when the assistant called submit_values_card on this turn. */
  submittedCard?: ArticulatedValuesCardDraft
}

const MAX_TURN_STEPS = 4

/**
 * Run one turn of articulation. Pure-ish: takes a transcript + new user
 * message, returns the updated transcript and any submitted card. The caller
 * is responsible for persistence.
 */
export async function runArticulationTurn(args: {
  transcript: ChatMessage[]
  userMessage: string
  topic?: string
  questionTitle?: string
  model?: string
  reasoningEffort?: "minimal" | "low" | "medium" | "high"
}): Promise<ArticulationTurn> {
  const model = args.model ?? DEFAULT_MODEL
  const reasoningEffort = args.reasoningEffort ?? "minimal"

  const systemMessage: ChatMessage = {
    role: "system",
    content: args.topic
      ? `${ARTICULATION_SYSTEM_PROMPT}\n\n## This deliberation\nTopic: ${args.topic}${
          args.questionTitle ? `\nQuestion: ${args.questionTitle}` : ""
        }`
      : ARTICULATION_SYSTEM_PROMPT,
  }

  const messagesWithUser: ChatMessage[] = [
    ...args.transcript,
    { role: "user", content: args.userMessage },
  ]

  // Stripped to OpenAI's expected shape.
  const apiMessages = (msgs: ChatMessage[]) =>
    [systemMessage, ...msgs].map((m) => {
      const out: any = { role: m.role, content: m.content }
      if (m.tool_call_id) out.tool_call_id = m.tool_call_id
      if (m.tool_calls) out.tool_calls = m.tool_calls
      if (m.name) out.name = m.name
      return out
    })

  let transcript: ChatMessage[] = messagesWithUser
  let submittedCard: ArticulatedValuesCardDraft | undefined
  let assistantText = ""

  // gpt-5 / reasoning models accept reasoning_effort but reject custom temperature.
  // For non-reasoning models we fall back to a sensible temperature.
  const isReasoningModel = /^gpt-5|^o\d/.test(model)

  for (let step = 0; step < MAX_TURN_STEPS; step++) {
    const baseParams: any = {
      model,
      tools: [SUBMIT_VALUES_CARD_TOOL],
      messages: apiMessages(transcript),
    }
    if (isReasoningModel) {
      baseParams.reasoning_effort = reasoningEffort
    } else {
      baseParams.temperature = 0.7
    }
    const response = await openai.chat.completions.create(baseParams)
    const choice = response.choices[0]?.message
    if (!choice) break

    const toolCalls = choice.tool_calls ?? []
    const text = choice.content ?? ""
    if (text) assistantText += (assistantText ? "\n" : "") + text

    transcript = [
      ...transcript,
      {
        role: "assistant",
        content: text || null,
        tool_calls: toolCalls.length ? toolCalls : undefined,
      },
    ]

    if (!toolCalls.length) break

    // Handle the only tool we expose. If the model invents others, ignore.
    let foundCard = false
    for (const call of toolCalls) {
      const fnName = call.type === "function" ? call.function.name : undefined
      const fnArgs = call.type === "function" ? call.function.arguments : ""
      if (fnName === "submit_values_card") {
        try {
          const parsed = JSON.parse(fnArgs) as ArticulatedValuesCardDraft
          submittedCard = parsed
          foundCard = true
          transcript = [
            ...transcript,
            {
              role: "tool",
              tool_call_id: call.id,
              name: "submit_values_card",
              content: "Submitted the values card. Go ahead and thank the user.",
            },
          ]
        } catch (e) {
          transcript = [
            ...transcript,
            {
              role: "tool",
              tool_call_id: call.id,
              name: "submit_values_card",
              content: `Error parsing arguments: ${(e as Error).message}`,
            },
          ]
        }
      } else {
        transcript = [
          ...transcript,
          {
            role: "tool",
            tool_call_id: call.id,
            name: fnName ?? "unknown",
            content: `Unknown tool ${fnName ?? call.type}; ignored.`,
          },
        ]
      }
    }

    if (foundCard) break // submit and stop; the next assistant text is the thank-you next turn
  }

  return { assistantText, transcript, submittedCard }
}

/**
 * Persist an articulated card. Extracted from the legacy
 * api.chat-assistant.ts:submitValuesCard so both the human chat route
 * and the simulation harness write through the same path.
 */
export async function persistArticulatedCard(args: {
  authorId: number
  threadId: string
  deliberationId: number
  questionId: number
  transcript: ChatMessage[]
  card: ArticulatedValuesCardDraft
  evaluation?: any
}) {
  const { authorId, threadId, deliberationId, questionId, transcript, card } = args

  const chat = await db.chat.upsert({
    create: {
      id: threadId,
      userId: authorId,
      deliberationId,
      questionId,
      transcript: transcript as any,
      evaluation: args.evaluation ?? undefined,
    },
    update: {
      transcript: transcript as any,
      ...(args.evaluation ? { evaluation: args.evaluation } : {}),
    },
    where: { id: threadId },
  })

  const valuesCard = await db.valuesCard.upsert({
    create: {
      title: card.title,
      chatId: chat.id,
      deliberationId: chat.deliberationId,
      description: card.description,
      policies: card.policies,
      questionId,
    },
    update: {
      title: card.title,
      description: card.description,
      policies: card.policies,
    },
    where: { chatId: chat.id },
  })

  await embedNonCanonicalCard(valuesCard)

  // Mirror the legacy KV write so the front-end keeps showing the card on reloads.
  const kvData = {
    type: "values_card",
    title: card.title,
    description: card.description,
    policies: card.policies,
  }
  try {
    await kv.set(`data:${threadId}`, JSON.stringify(kvData))
  } catch (e) {
    console.warn("KV write failed (non-fatal):", (e as Error).message)
  }

  // Background context-mining (matches legacy behavior).
  try {
    await inngest.send({
      name: "find-new-contexts",
      data: { deliberationId, chatId: chat.id },
    })
  } catch (e) {
    console.warn("inngest find-new-contexts failed (non-fatal):", (e as Error).message)
  }

  return { chat, valuesCard }
}

/** Read the persisted transcript for a chat. */
export async function loadChatTranscript(threadId: string): Promise<ChatMessage[]> {
  const chat = await db.chat.findUnique({ where: { id: threadId } })
  return ((chat?.transcript as any) ?? []) as ChatMessage[]
}

export const ARTICULATION_TOOL_NAME = SUBMIT_VALUES_CARD_TOOL.function.name
