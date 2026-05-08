import { LoaderFunctionArgs, json } from "@remix-run/node"
import {
  Form,
  useLoaderData,
  useNavigation,
  useParams,
} from "@remix-run/react"
import type { UIMessage } from "ai"
import { Chat } from "../components/chat/chat"
import Header from "../components/header"
import { db, ensureLoggedIn } from "~/config.server"
import { ChatMessage } from "~/services/articulation/chat"
import { chatMessagesToUIMessages } from "~/services/articulation/transcript"

export async function loader({ request, params }: LoaderFunctionArgs) {
  await ensureLoggedIn(request)
  const threadId = params.threadId!
  const questionId = params.questionId!

  const [chat, chosenQuestion] = await Promise.all([
    db.chat.findUnique({ where: { id: threadId } }),
    db.question.findFirst({ where: { id: Number(questionId) } }),
  ])

  let messages: UIMessage[] = []
  if (chat?.transcript) {
    messages = chatMessagesToUIMessages(chat.transcript as any as ChatMessage[])
  }

  // Seed with the question as the first assistant message if this is a fresh
  // chat. The user will see it as the assistant's opening prompt.
  if (messages.length === 0 && chosenQuestion) {
    messages = [
      {
        id: "seed",
        role: "assistant",
        parts: [{ type: "text", text: chosenQuestion.question }],
      } as UIMessage,
    ]
  }

  return json({ messages })
}

export default function ChatScreen() {
  const { threadId, deliberationId, questionId } = useParams()
  const { messages } = useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const seeding =
    navigation.formAction === "/api/dev/seed-card" &&
    (navigation.state as string) !== "idle"

  return (
    <div className="flex flex-col h-screen w-screen">
      <Header />
      <Chat
        deliberationId={Number(deliberationId)}
        questionId={Number(questionId)}
        oldMessages={messages as UIMessage[]}
        threadId={threadId!}
      />
      {/* Dev helper: skip the conversation, persist a random card to test
          downstream flow. Subtle muted link in the corner. */}
      <Form
        method="post"
        action="/api/dev/seed-card"
        className="fixed bottom-2 right-3 z-[60]"
      >
        <input type="hidden" name="threadId" value={threadId} />
        <input type="hidden" name="deliberationId" value={deliberationId} />
        <input type="hidden" name="questionId" value={questionId} />
        <button
          type="submit"
          disabled={seeding}
          className="text-[11px] text-muted-foreground/70 hover:text-foreground underline-offset-4 hover:underline disabled:opacity-50"
        >
          {seeding ? "Seeding…" : "Seed random value"}
        </button>
      </Form>
    </div>
  )
}
