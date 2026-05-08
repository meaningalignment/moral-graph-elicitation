import { ActionFunctionArgs } from "@remix-run/node"
import { streamText, tool, convertToModelMessages, UIMessage } from "ai"
import { openai as aiOpenai } from "@ai-sdk/openai"
import { z } from "zod"
import { ensureLoggedIn } from "~/config.server"
import {
  ARTICULATION_SYSTEM_PROMPT,
} from "~/services/articulation/prompt"
import {
  persistArticulatedCard,
  ChatMessage,
} from "~/services/articulation/chat"
import { uiMessagesToChatMessages } from "~/services/articulation/transcript"

export const config = { maxDuration: 300 }

const MODEL_ID =
  process.env.OPENAI_ARTICULATION_MODEL ?? "gpt-5"
const isReasoningModel = /^gpt-5|^o\d/.test(MODEL_ID)

export async function action({ request }: ActionFunctionArgs) {
  const authorId = await ensureLoggedIn(request)

  const body = (await request.json()) as {
    messages: UIMessage[]
    threadId: string
    deliberationId: number
    questionId: number
  }
  const { messages, threadId, deliberationId, questionId } = body

  // Persist the articulated card via the canonical write path (DB upsert,
  // embedding, KV mirror, find-new-contexts Inngest event). The transcript
  // we record is what the user has typed up to and including the turn that
  // triggered the tool call.
  const submitValuesCard = tool({
    description:
      "Submit the articulated values card once it has been jointly developed with the user.",
    inputSchema: z.object({
      title: z.string(),
      description: z.string(),
      policies: z.array(z.string()),
    }),
    execute: async (card) => {
      const transcript: ChatMessage[] = uiMessagesToChatMessages(messages)
      await persistArticulatedCard({
        authorId,
        threadId,
        deliberationId,
        questionId,
        transcript,
        card,
      })
      return { ok: true }
    },
  })

  const result = streamText({
    model: aiOpenai(MODEL_ID),
    system: ARTICULATION_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: { submit_values_card: submitValuesCard },
    // gpt-5 / reasoning models reject custom temperature.
    ...(isReasoningModel
      ? { providerOptions: { openai: { reasoningEffort: "minimal" } } }
      : { temperature: 0.7 }),
  })

  return result.toUIMessageStreamResponse()
}
