import { LoaderFunctionArgs, json } from "@remix-run/node"
import { Form, useLoaderData, useNavigation, useParams } from "@remix-run/react"
import { kv } from "@vercel/kv"
import { Chat } from "../components/chat/chat"
import Header from "../components/header"
import { db, ensureLoggedIn, openai } from "~/config.server"

export async function loader({ request, params }: LoaderFunctionArgs) {
  await ensureLoggedIn(request)
  const threadId = params.threadId!
  const questionId = params.questionId!

  // Awaited directly. defer() doesn't stream on Vercel's Node runtime.
  // Upstash KV is rate-limited intermittently; treat failure as no data
  // rather than crashing the whole loader.
  const [response, data, runs, chosenQuestion] = await Promise.all([
    openai.beta.threads.messages.list(threadId, { order: "asc" }),
    kv.get<string>(`data:${threadId}`).catch(() => null),
    openai.beta.threads.runs.list(threadId),
    db.question.findFirst({ where: { id: Number(questionId) } }),
  ])

  const messages = response.data.map((m: any) => {
    const m2: any = m
    if (m.content && m.content[0]?.text?.value) {
      m2.content = m.content[0].text.value
    }
    return m2
  })

  if (data) {
    messages.push({ role: "data", data })
    const lastElement = messages.pop()
    const secondLastElement = messages.pop()
    messages.push(lastElement)
    messages.push(secondLastElement)
  }

  // Cancel any in-progress runs in the background; don't await.
  Promise.all(
    runs.data.map((run) => {
      if (
        run.status === "in_progress" ||
        run.status === "queued" ||
        run.status === "requires_action"
      ) {
        return openai.beta.threads.runs.cancel(run.id, { thread_id: threadId })
      }
    })
  ).catch(() => {})

  if (messages.length === 0 && chosenQuestion) {
    const seedMessage = chosenQuestion.question
    messages.push({ role: "assistant", content: seedMessage })
    await openai.beta.threads.messages.create(threadId, {
      role: "assistant",
      content: seedMessage ?? "Hello There!",
    })
  }

  return json({ messages })
}

export default function ChatScreen() {
  const { threadId, deliberationId, questionId } = useParams()
  const { messages } = useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const seeding =
    navigation.formAction === "/api/dev/seed-card" &&
    navigation.state !== "idle"

  return (
    <div className="flex flex-col h-screen w-screen">
      <Header />
      <Chat
        deliberationId={Number(deliberationId)}
        questionId={Number(questionId)}
        oldMessages={messages}
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
