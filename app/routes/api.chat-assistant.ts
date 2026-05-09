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
  // we record is the conversation up to the user's last turn PLUS a synthetic
  // assistant tool_call + tool result for submit_values_card — `messages` is
  // the inbound POST body and does not yet contain the assistant response
  // we're streaming, so persisting it as-is would leave the saved transcript
  // missing the tool call. Without that, reloading the chat thread doesn't
  // re-render the values card and the "Continue" button stays hidden.
  const submitValuesCard = tool({
    description:
      "Submit the articulated values card once it has been jointly developed with the user.",
    inputSchema: z.object({
      title: z.string(),
      description: z.string(),
      policies: z.array(z.string()),
    }),
    execute: async (card, { toolCallId }) => {
      const baseTranscript = uiMessagesToChatMessages(messages)
      const transcript: ChatMessage[] = [
        ...baseTranscript,
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: toolCallId,
              type: "function",
              function: {
                name: "submit_values_card",
                arguments: JSON.stringify(card),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: toolCallId,
          name: "submit_values_card",
          content: JSON.stringify({ ok: true }),
        },
      ]
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
