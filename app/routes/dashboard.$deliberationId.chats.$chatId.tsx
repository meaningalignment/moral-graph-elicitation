import { LoaderFunctionArgs, json } from "@remix-run/node"
import { useLoaderData } from "@remix-run/react"
import type { UIMessage } from "ai"
import { ChatList } from "~/components/chat/chat-list"
import { auth, db } from "~/config.server"
import type { ChatMessage } from "~/services/articulation/chat"
import { chatMessagesToUIMessages } from "~/services/articulation/transcript"

export async function loader({ params, request }: LoaderFunctionArgs) {
  const chatId = params.chatId!
  const userId = await auth.getUserId(request)
  const chat = await db.chat.findUnique({
    where: { id: chatId },
  })
  const cardId = (
    await db.canonicalValuesCard.findFirst({
      where: {
        valuesCards: {
          some: {
            chatId,
          },
        },
      },
    })
  )?.id
  if (!chat) throw new Error("Chat not found")
  const evaluation = chat?.evaluation as Record<string, string>
  const transcript = (chat.transcript as any as ChatMessage[]) ?? []
  // Skip the seeded system prompt (first message) — admin doesn't need it.
  const messages = chatMessagesToUIMessages(
    transcript[0]?.role === "system" ? transcript.slice(1) : transcript
  )
  return json({
    messages,
    evaluation,
    chatId,
    cardId,
    chat,
    isUser: chat?.userId === userId,
  })
}

export default function AdminChat() {
  const { messages, chatId } = useLoaderData<typeof loader>()

  if (!messages || messages.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 mt-12">
        <div className="rounded-lg border bg-card p-8">
          <h1 className="mb-2 text-lg font-semibold">No Transcript</h1>
          <p className="mb-2 leading-normal text-muted-foreground">
            Transcript is not available for this chat.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ChatList
      threadId={chatId}
      messages={messages as UIMessage[]}
      isLoading={false}
    />
  )
}
