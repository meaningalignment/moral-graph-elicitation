import { ActionFunctionArgs, json } from "@remix-run/node"
import { db } from "~/config.server"
import type { ChatMessage } from "~/services/articulation/chat"

// Export for tests.
export function removeLastMatchAndPrecedingToolCalls(
  messages: ChatMessage[],
  predicate: (message: ChatMessage) => boolean
): ChatMessage[] {
  let shouldRemove = false
  let userOrAssistantFound = false

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    const isToolMessage = m.role === "tool" || (m.tool_calls?.length ?? 0) > 0

    if (!isToolMessage && predicate(m)) {
      shouldRemove = true
      userOrAssistantFound = true
    }

    if (shouldRemove && !isToolMessage && !userOrAssistantFound) {
      break
    }

    if (shouldRemove) {
      messages.splice(i, 1)
    }

    if (shouldRemove && !isToolMessage) {
      userOrAssistantFound = false
    }
  }

  return messages
}

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json()
  let { message, chatId } = body as {
    message: ChatMessage
    chatId: string
  }

  const chat = await db.chat.findUnique({ where: { id: chatId } })

  if (!chat) {
    throw new Error(`No chat with id ${chatId}`)
  }

  const messages = chat.transcript as any as ChatMessage[]

  // Remove the last occurrence of a message with the matching content + role,
  // and any directly-preceding tool-call messages.
  //
  // We don't store stable IDs in the DB. If multiple messages have the same
  // role + content, the last is removed regardless of which was clicked.
  // Admin-only feature, so this is acceptable.
  const newMessages = removeLastMatchAndPrecedingToolCalls(
    messages,
    (m) => m.content === message.content && m.role === message.role
  )

  console.log(`Removed messages from chat ${chatId}.`)

  await db.chat.update({
    where: { id: chatId },
    data: { transcript: newMessages as any },
  })

  return json({ message: "Removed message in db" })
}
