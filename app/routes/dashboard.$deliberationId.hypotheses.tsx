import { defer, LoaderFunctionArgs, json } from "@remix-run/node"
import {
  Await,
  NavLink,
  Outlet,
  useLoaderData,
  useParams,
  useFetcher,
} from "@remix-run/react"
import { db, inngest } from "~/config.server"
import { cn, encodeString } from "~/lib/utils"
import { Alert, AlertTitle, AlertDescription } from "~/components/ui/alert"
import { AlertCircle } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Button } from "~/components/ui/button"
import { Suspense, useState } from "react"
import { Skeleton } from "~/components/ui/skeleton"

export async function loader({ params }: LoaderFunctionArgs) {
  const { deliberationId } = params

  const data = Promise.all([
    db.edgeHypothesis.findMany({
      orderBy: { createdAt: "desc" },
      where: { deliberationId: Number(deliberationId)! },
      select: {
        fromId: true,
        toId: true,
        story: true,
        hypothesisRunId: true,
        createdAt: true,
        contextId: true,
        from: { select: { id: true, title: true, description: true } },
        to: { select: { id: true, title: true, description: true } },
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
  ]).then(([hypotheses, questions, contexts]) => ({
    hypotheses,
    questions,
    contexts,
  }))

  return defer({ data })
}

export async function action({ request, params }: LoaderFunctionArgs) {
  const { deliberationId } = params

  await inngest.send({
    name: "hypothesize",
    data: { deliberationId: Number(deliberationId) },
  })

  return json({ success: true })
}

export default function AdminHypotheses() {
  const { data } = useLoaderData<typeof loader>()
  return (
    <Suspense fallback={<HypothesesShell />}>
      <Await resolve={data}>{(resolved) => <HypothesesView data={resolved} />}</Await>
    </Suspense>
  )
}

function HypothesesShell() {
  return (
    <div className="flex h-full">
      <div className="w-64 flex-shrink-0 border-r bg-card px-3 py-4 space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="h-6 w-1/3 mb-3" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  )
}

function HypothesesView({
  data,
}: {
  data: {
    hypotheses: any[]
    questions: any[]
    contexts: any[]
  }
}) {
  const { deliberationId } = useParams()
  const fetcher = useFetcher()
  const [selectedQuestion, setSelectedQuestion] = useState<string>("all")
  const [selectedContext, setSelectedContext] = useState<string>("all")
  const [selectedRunId, setSelectedRunId] = useState<string>("all")

  // Filter hypotheses based on selected question/context
  const filteredHypotheses = data.hypotheses.filter((hypothesis) => {
    if (
      selectedQuestion === "all" &&
      selectedContext === "all" &&
      selectedRunId === "all"
    )
      return true

    if (selectedContext !== "all" && hypothesis.contextId !== selectedContext)
      return false

    if (
      selectedRunId !== "all" &&
      hypothesis.hypothesisRunId?.toString() !== selectedRunId
    )
      return false

    if (selectedQuestion !== "all") {
      // Find if the context is linked to the selected question
      const context = data.contexts.find((c) => c.id === hypothesis.contextId)
      return context?.ContextsForQuestions.some(
        (cq) => cq.questionId.toString() === selectedQuestion
      )
    }

    return true
  })

  // Get unique run IDs with their dates
  const runIdsWithDates = Array.from(
    new Set(data.hypotheses.map((h) => h.hypothesisRunId))
  )
    .filter(Boolean)
    .map((runId) => {
      const firstHypothesis = data.hypotheses.find(
        (h) => h.hypothesisRunId === runId
      )
      return {
        runId,
        date: firstHypothesis
          ? new Date(firstHypothesis.createdAt)
          : new Date(),
      }
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime()) // Sort by date descending

  return (
    <div className="flex h-full">
      <div className="w-64 flex-shrink-0 border-r overflow-y-auto bg-card px-3 py-4">
        <div className="mb-6">
          <div className="flex items-center rounded-lg px-3 py-2 text-foreground">
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
            <span className="ml-3 text-base font-semibold">Hypotheses</span>
          </div>
          <div className="px-3 text-sm text-muted-foreground">
            {filteredHypotheses.length} upgrade
            {filteredHypotheses.length !== 1 ? "s" : ""} available
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

          <Select value={selectedRunId} onValueChange={setSelectedRunId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Run" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Runs</SelectItem>
              {runIdsWithDates.map(({ runId, date }) => (
                <SelectItem key={runId} value={runId}>
                  {date.toLocaleDateString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <fetcher.Form method="post" className="w-full">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle" ? "Generating..." : "Generate More"}
            </Button>
          </fetcher.Form>
        </div>

        <ul className="space-y-2 text-sm font-medium">
          {filteredHypotheses.map((hypothesis) => (
            <NavLink
              prefetch="intent"
              to={`/dashboard/${deliberationId}/hypotheses/${
                hypothesis.fromId
              }/${hypothesis.toId}/${encodeString(hypothesis.contextId)}`}
              key={`${hypothesis.fromId}-${hypothesis.toId}-${hypothesis.contextId}`}
              className={({ isActive, isPending }) =>
                cn(
                  "block rounded-lg hover:bg-muted",
                  isPending && "bg-muted",
                  isActive && "bg-muted"
                )
              }
            >
              <li className="px-3 py-2">
                <div
                  className="font-medium truncate"
                  title={hypothesis.from!.title}
                >
                  {hypothesis.from!.title} → {hypothesis.to!.title}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(hypothesis.createdAt).toLocaleDateString()}
                </div>
                <div className="text-xs text-muted-foreground">
                  {hypothesis.contextId}
                </div>
              </li>
            </NavLink>
          ))}
        </ul>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          {filteredHypotheses.length === 0 ? (
            <Alert className="bg-muted">
              <div className="flex flex-row space-x-2">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No hypotheses found</AlertTitle>
              </div>
              <AlertDescription>
                {selectedQuestion !== "all" || selectedContext !== "all"
                  ? "No hypotheses match your selected filters."
                  : "No hypotheses available. Hypothesized value upgrades will appear here once they are generated."}
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
