import { LoaderFunctionArgs, json } from "@remix-run/node"
import {
  NavLink,
  Outlet,
  useLoaderData,
  useParams,
} from "@remix-run/react"
import { db } from "~/config.server"
import { cn } from "~/lib/utils"
import { Alert, AlertTitle, AlertDescription } from "~/components/ui/alert"
import { AlertCircle } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { useState } from "react"

export async function loader({ params }: LoaderFunctionArgs) {
  const { deliberationId } = params

  // Awaited directly. defer() doesn't stream on Vercel's Node runtime.
  const [edges, questions, contexts] = await Promise.all([
    db.edge.findMany({
      orderBy: { createdAt: "desc" },
      where: { deliberationId: Number(deliberationId)! },
      select: {
        userId: true,
        createdAt: true,
        fromId: true,
        toId: true,
        comment: true,
        type: true,
        contextId: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    db.question.findMany({
      where: { deliberationId: Number(deliberationId) },
      select: {
        id: true,
        title: true,
        ContextsForQuestions: { select: { contextId: true } },
      },
    }),
    db.context.findMany({
      where: { deliberationId: Number(deliberationId) },
      include: {
        ContextsForQuestions: { select: { questionId: true } },
      },
    }),
  ])

  return json({ edges, questions, contexts })
}

function VoteBadge({ status }: { status: string }) {
  const label =
    status === "upgrade"
      ? "Upgrade"
      : status === "not_sure"
      ? "Not sure"
      : "No upgrade"
  // Sage for upgrade, muted-foreground for unsure, destructive for no.
  // Tinted text on a faint surface — quieter than the previous green/yellow/red.
  const styles =
    status === "upgrade"
      ? "bg-accent/15 text-accent border-accent/30"
      : status === "not_sure"
      ? "bg-muted text-muted-foreground border-border"
      : "bg-destructive/10 text-destructive border-destructive/30"
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border",
        styles
      )}
    >
      {label}
    </span>
  )
}

export default function AdminLinks() {
  const data = useLoaderData<typeof loader>()
  return <VotesView data={data} />
}

function VotesView({
  data,
}: {
  data: { edges: any[]; questions: any[]; contexts: any[] }
}) {
  const { deliberationId } = useParams()
  const [selectedQuestion, setSelectedQuestion] = useState<string>("all")
  const [selectedContext, setSelectedContext] = useState<string>("all")

  // Filter edges based on selected question/context
  const filteredEdges = data.edges.filter((edge) => {
    if (selectedQuestion === "all" && selectedContext === "all") return true

    if (selectedContext !== "all" && edge.contextId !== selectedContext)
      return false

    if (selectedQuestion !== "all") {
      // Find if the context is linked to the selected question
      const context = data.contexts.find((c) => c.id === edge.contextId)
      return context?.ContextsForQuestions.some(
        (cq) => cq.questionId.toString() === selectedQuestion
      )
    }

    return true
  })

  return (
    <div className="flex h-[calc(100vh-4rem)] -mt-4 -mx-4 sm:-mx-6">
      <aside className="w-80 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="px-4 pt-5 pb-3 border-b border-border">
          <h2 className="font-serif text-xl font-semibold tracking-tight">
            Votes
          </h2>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mt-1">
            {filteredEdges.length} vote{filteredEdges.length !== 1 ? "s" : ""}
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
          <ul className="divide-y divide-border">
            {filteredEdges.map((edge) => (
              <li key={edge.userId + edge.fromId + edge.toId}>
                <NavLink
                  prefetch="intent"
                  to={`/dashboard/${deliberationId}/votes/${edge.userId}/${edge.fromId}/${edge.toId}`}
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
                      <div className="text-sm font-medium text-foreground truncate">
                        {edge.user?.email ?? edge.user?.name ?? "Unknown"}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground mt-1">
                        {new Date(edge.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <VoteBadge status={edge.type} />
                  </div>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          {filteredEdges.length === 0 ? (
            <Alert className="bg-muted">
              <div className="flex flex-row space-x-2">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No votes found</AlertTitle>
              </div>
              <AlertDescription>
                {selectedQuestion !== "all" || selectedContext !== "all"
                  ? "No votes match your selected filters."
                  : "Votes for upgrades between values will appear here once participants start making connections."}
              </AlertDescription>
            </Alert>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </div>
  )
}
