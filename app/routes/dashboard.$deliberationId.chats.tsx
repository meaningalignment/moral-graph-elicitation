import { LoaderFunctionArgs, json } from "@remix-run/node"
import {
  Link,
  NavLink,
  Outlet,
  useLoaderData,
  useLocation,
  useParams,
} from "@remix-run/react"
import { db } from "~/config.server"
import { cn } from "~/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { useState } from "react"
import { Alert, AlertTitle, AlertDescription } from "~/components/ui/alert"
import { AlertCircle, ArrowLeft } from "lucide-react"

export async function loader({ params }: LoaderFunctionArgs) {
  const { deliberationId } = params

  // Awaited directly. defer() doesn't stream on Vercel's Node runtime.
  const [chats, questions, contexts] = await Promise.all([
    db.chat.findMany({
      orderBy: { createdAt: "desc" },
      where: { deliberationId: Number(deliberationId)! },
      select: {
        id: true,
        createdAt: true,
        copiedFromId: true,
        evaluation: true,
        questionId: true,
        Question: {
          select: {
            ContextsForQuestions: { select: { contextId: true } },
          },
        },
        user: { select: { id: true, name: true, email: true } },
        ValuesCard: true,
      },
    }),
    db.question.findMany({
      where: { deliberationId: Number(deliberationId)! },
      select: { id: true, title: true },
    }),
    db.context.findMany({
      where: { deliberationId: Number(deliberationId)! },
      select: { id: true },
    }),
  ])

  return json({ chats, questions, contexts })
}

function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function StatusDot({ hasValuesCard }: { hasValuesCard: boolean }) {
  return (
    <span
      title={hasValuesCard ? "Submitted card" : "No card"}
      aria-label={hasValuesCard ? "Submitted card" : "No card"}
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full shrink-0",
        hasValuesCard ? "bg-primary" : "bg-border"
      )}
    />
  )
}

export default function AdminChats() {
  const data = useLoaderData<typeof loader>()
  return <ChatsView data={data} />
}

function ChatsView({
  data,
}: {
  data: { chats: any[]; questions: any[]; contexts: any[] }
}) {
  const [selectedQuestion, setSelectedQuestion] = useState("all")
  const [selectedContext, setSelectedContext] = useState("all")
  const params = useParams()
  const location = useLocation()
  const isChildRouteActive = Boolean(
    params.chatId ||
      location.pathname.replace(/\/$/, "").split("/").length > 4
  )

  const filteredChats = data.chats.filter((chat) => {
    const matchesQuestion =
      selectedQuestion === "all" ||
      chat.questionId?.toString() === selectedQuestion
    const matchesContext =
      selectedContext === "all" ||
      chat.Question.ContextsForQuestions.some(
        (context) => context.contextId === selectedContext
      )
    return matchesQuestion && matchesContext
  })

  return (
    <div className="flex h-[calc(100vh-4rem)] -mt-4 -mx-4 sm:-mx-6">
      <aside
        className={cn(
          "w-full md:w-80 md:shrink-0 border-r border-border bg-card flex-col",
          isChildRouteActive ? "hidden md:flex" : "flex"
        )}
      >
        <div className="px-4 pt-5 pb-3 border-b border-border">
          <h2 className="text-base font-semibold tracking-tight">Chats</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filteredChats.length} chat{filteredChats.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="px-4 py-3 space-y-2 border-b border-border">
          <Select value={selectedQuestion} onValueChange={setSelectedQuestion}>
            <SelectTrigger className="h-9 w-full text-sm">
              <SelectValue placeholder="All questions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All questions</SelectItem>
              {data.questions.map((question) => (
                <SelectItem key={question.id} value={question.id.toString()}>
                  {question.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedContext} onValueChange={setSelectedContext}>
            <SelectTrigger className="h-9 w-full text-sm">
              <SelectValue placeholder="All contexts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All contexts</SelectItem>
              {data.contexts.map((context) => (
                <SelectItem key={context.id} value={context.id}>
                  {context.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredChats.length === 0 ? (
            <Alert className="m-4 bg-muted">
              <div className="flex flex-row space-x-2">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No chats found</AlertTitle>
              </div>
              <AlertDescription>
                {selectedQuestion !== "all" || selectedContext !== "all"
                  ? "No chats match your selected filters."
                  : "No chats available yet."}
              </AlertDescription>
            </Alert>
          ) : (
            <ul className="divide-y divide-border">
              {filteredChats.map((chat) => (
                <li key={chat.id}>
                  <NavLink
                    prefetch="intent"
                    to={chat.id}
                    className={({ isActive, isPending }) =>
                      cn(
                        "relative block px-4 py-3 hover:bg-muted/60 transition-colors",
                        (isPending || isActive) && "bg-secondary/60",
                        isActive &&
                          "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-primary"
                      )
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <StatusDot
                            hasValuesCard={chat.ValuesCard !== null}
                          />
                          <span className="text-sm font-medium text-foreground truncate">
                            {chat.user?.email ?? chat.user?.name ?? "Unknown"}
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground mt-1 ml-3.5">
                          {formatDate(chat.createdAt)}
                        </div>
                        {chat.copiedFromId && (
                          <div className="font-mono text-[11px] text-muted-foreground mt-0.5 ml-3.5">
                            ↳ copy of {chat.copiedFromId}
                          </div>
                        )}
                      </div>
                      {chat.evaluation && (
                        <span className="font-mono text-xs text-destructive shrink-0">
                          {(chat.evaluation as any).worst_score}
                        </span>
                      )}
                    </div>
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <div
        className={cn(
          "flex-1 overflow-y-auto min-w-0",
          isChildRouteActive ? "block" : "hidden md:block"
        )}
      >
        {isChildRouteActive && (
          <div className="md:hidden sticky top-0 bg-card border-b border-border px-4 py-2 z-10">
            <Link
              to={`/dashboard/${params.deliberationId}/chats`}
              prefetch="intent"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to chats
            </Link>
          </div>
        )}
        <div className="p-4 sm:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
