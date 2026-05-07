import { defer, LoaderFunctionArgs } from "@remix-run/node"
import {
  Await,
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
import { Suspense, useState } from "react"
import { Skeleton } from "~/components/ui/skeleton"

export async function loader({ params }: LoaderFunctionArgs) {
  const { deliberationId } = params

  const data = Promise.all([
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
  ]).then(([edges, questions, contexts]) => ({ edges, questions, contexts }))

  return defer({ data })
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        status === "upgrade"
          ? "bg-green-100 text-green-800"
          : status === "not_sure"
          ? "bg-yellow-100 text-yellow-800"
          : "bg-red-100 text-red-800"
      )}
    >
      {status === "upgrade"
        ? "Upgrade"
        : status === "not_sure"
        ? "Not sure"
        : "No Upgrade"}
    </span>
  )
}

export default function AdminLinks() {
  const { data } = useLoaderData<typeof loader>()
  return (
    <Suspense fallback={<VotesShell />}>
      <Await resolve={data}>{(resolved) => <VotesView data={resolved} />}</Await>
    </Suspense>
  )
}

function VotesShell() {
  return (
    <div className="flex h-full">
      <div className="w-64 flex-shrink-0 border-r bg-white px-3 py-4 space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  )
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
    <div className="flex h-full">
      <div className="w-64 flex-shrink-0 border-r overflow-y-auto bg-white px-3 py-4">
        <div className="mb-6">
          <div className="flex items-center rounded-lg px-3 py-2 text-slate-900">
            <svg
              className="h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            <span className="ml-3 text-base font-semibold">Votes</span>
          </div>
          <div className="px-3 text-sm text-slate-500">
            {filteredEdges.length} vote{filteredEdges.length !== 1 ? "s" : ""}{" "}
            available
          </div>
        </div>

        <div className="mb-6 space-y-4">
          <Select value={selectedQuestion} onValueChange={setSelectedQuestion}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Question" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Questions</SelectItem>
              {data.questions.map((question) => (
                <SelectItem key={question.id} value={question.id.toString()}>
                  {question.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedContext} onValueChange={setSelectedContext}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Context" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Contexts</SelectItem>
              {data.contexts.map((context) => (
                <SelectItem key={context.id} value={context.id}>
                  {context.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ul className="space-y-2 text-sm font-medium">
          {filteredEdges.map((edge) => (
            <NavLink
              prefetch="intent"
              to={`/dashboard/${deliberationId}/votes/${edge.userId}/${edge.fromId}/${edge.toId}`}
              key={edge.userId + edge.fromId + edge.toId}
              className={({ isActive, isPending }) =>
                cn(
                  "block rounded-lg hover:bg-slate-100 ",
                  isPending && "bg-slate-50 ",
                  isActive && "bg-slate-100 "
                )
              }
            >
              <li className="px-3 py-2">
                <div className="font-medium">{edge.user.name}</div>
                <div className="text-sm text-slate-500 ">{edge.user.email}</div>
                <div className="text-xs text-slate-400  mt-1">
                  {edge.createdAt}
                </div>
                <StatusBadge status={edge.type} />
              </li>
            </NavLink>
          ))}
        </ul>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          {filteredEdges.length === 0 ? (
            <Alert className="bg-slate-50">
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
