import { LoaderFunctionArgs, defer } from "@remix-run/node"
import { Await, useLoaderData, useParams } from "@remix-run/react"
import { kv } from "@vercel/kv"
import { Suspense } from "react"
import { Chat } from "../components/chat/chat"
import Header from "../components/header"
import { db, ensureLoggedIn, openai } from "~/config.server"
import { Skeleton } from "~/components/ui/skeleton"

export async function loader({ request, params }: LoaderFunctionArgs) {
  // Auth gate stays synchronous so unauthenticated users get redirected
  // before we render anything.
  await ensureLoggedIn(request)
  const threadId = params.threadId!
  const questionId = params.questionId!

  // Defer the OpenAI fetches — they're the slow part. Header renders instantly.
  const messages = (async () => {
    const [response, data, runs, chosenQuestion] = await Promise.all([
      openai.beta.threads.messages.list(threadId, { order: "asc" }),
      kv.get<string>(`data:${threadId}`),
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

    return messages
  })()

  return defer({ messages })
}

export default function ChatScreen() {
  const { threadId, deliberationId, questionId } = useParams()
  const { messages } = useLoaderData<typeof loader>()

  return (
    <div className="flex flex-col h-screen w-screen">
      <Header />
      <Suspense fallback={<ChatSkeleton />}>
        <Await resolve={messages}>
          {(resolved) => (
            <Chat
              deliberationId={Number(deliberationId)}
              questionId={Number(questionId)}
              oldMessages={resolved}
              threadId={threadId!}
            />
          )}
        </Await>
      </Suspense>
    </div>
  )
}

function ChatSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-10 pb-32 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="ml-auto max-w-[80%] space-y-2 text-right">
        <Skeleton className="h-4 w-2/3 ml-auto" />
        <Skeleton className="h-4 w-1/2 ml-auto" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  )
}
