import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node"
import { auth, db } from "~/config.server"
import type { ChatMessage } from "~/services/articulation/chat"

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await auth.getCurrentUser(request)
  if (!user) throw new Response("Unauthorized", { status: 401 })

  const chatId = params.chatId
  const chat = await db.chat.findUnique({
    where: { id: chatId },
    select: { userId: true, transcript: true },
  })
  if (!chat) throw new Response("Not found", { status: 404 })
  if (chat.userId !== user.id && !user.isAdmin) {
    throw new Response("Forbidden", { status: 403 })
  }

  const messages = (chat.transcript as any as ChatMessage[]) ?? []
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
  const user = await auth.getCurrentUser(request)
  if (!user) throw new Response("Unauthorized", { status: 401 })

  const body = await request.json()
  let { messages, chatId } = body
  messages = (messages as ChatMessage[]).filter(
    (message) => message.content !== ""
  )

  const chat = await db.chat.findUnique({ where: { id: chatId } })
  if (!chat) throw new Response(`No chat with id ${chatId}`, { status: 404 })
  if (chat.userId !== user.id && !user.isAdmin) {
    throw new Response("Forbidden", { status: 403 })
  }

  const prevMessages = chat.transcript as any as ChatMessage[]
  const mergedMessages = mergeMessages(prevMessages, messages)

  await db.chat.update({
    where: { id: chatId },
    data: { transcript: mergedMessages as any },
  })

  return json({ message: "Saved new messages in db" })
}
