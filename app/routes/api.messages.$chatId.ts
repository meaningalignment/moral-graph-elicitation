import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node"
import { db } from "~/config.server"
import type { ChatMessage } from "~/services/articulation/chat"

export async function loader({ params }: LoaderFunctionArgs) {
  const chatId = params.chatId
  const chat = await db.chat.findUnique({
    where: { id: chatId },
  })
  const messages = (chat?.transcript as any as ChatMessage[]) ?? []

  return json({ messages })
}

function mergeMessages(
  oldMessages: ChatMessage[],
  newMessages: ChatMessage[]
) {
  // Walk back through new messages until we find one not in old; append the rest.
  let i = newMessages.length - 1
  while (i >= 0) {
    const newMessage = newMessages[i]
    const oldMessage = oldMessages.find(
      (message) => message.content === newMessage.content
    )
    if (!oldMessage) break
    i--
  }
  return [...oldMessages, ...newMessages.slice(i)]
}

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json()
  let { messages, chatId } = body
  messages = (messages as ChatMessage[]).filter(
    (message) => message.content !== ""
  )

  const chat = await db.chat.findUnique({ where: { id: chatId } })
  if (!chat) throw new Error(`No chat with id ${chatId}`)
  const prevMessages = chat.transcript as any as ChatMessage[]
  const mergedMessages = mergeMessages(prevMessages, messages)

  await db.chat.update({
    where: { id: chatId },
    data: { transcript: mergedMessages as any },
  })

  return json({ message: "Saved new messages in db" })
}
