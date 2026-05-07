import { LoaderFunctionArgs, ActionFunctionArgs, json } from "@remix-run/node"
import {
  useLoaderData,
  Link,
  useRevalidator,
  useParams,
  useFetcher,
} from "@remix-run/react"
import { useEffect, useState } from "react"
import { db, inngest } from "~/config.server"
import { Button } from "~/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "~/components/ui/card"
import { redirect } from "@remix-run/node"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { QuestionMarkCircledIcon } from "@radix-ui/react-icons"
import { ChevronDownIcon } from "@radix-ui/react-icons"
import { Loader2 } from "lucide-react"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { ChevronRightIcon } from "@radix-ui/react-icons"
import LoadingButton from "~/components/loading-button"
import { Input } from "~/components/ui/input"
import {
  SimulateDialog,
  Persona as DialogPersona,
} from "~/components/simulate-dialog"

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const deliberationId = Number(params.deliberationId)!
  const deliberation = await db.deliberation.findFirstOrThrow({
    where: { id: deliberationId },
    include: {
      questions: {
        include: {
          ContextsForQuestions: {
            include: {
              context: {
                select: {
                  id: true,
                  createdInChatId: true,
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          edges: true,
          edgeHypotheses: true,
          valuesCards: {
            where: {
              seedGenerationRunId: {
                equals: null,
              },
            },
          },
          canonicalValuesCards: true,
        },
      },
      chats: {
        select: {
          userId: true,
        },
        where: {
          ValuesCard: {
            isNot: null,
          },
        },
        distinct: ["userId"],
      },
    },
  })

  const firstIntervention = await db.intervention.findFirst({
    where: {
      deliberationId,
      shouldDisplay: true,
    },
    select: {
      questionId: true,
    },
  })

  const interventionsCount = await db.intervention.count({
    where: {
      deliberationId,
      shouldDisplay: true,
    },
  })

  return {
    deliberation,
    interventionsCount,
    firstQuestionId: firstIntervention?.questionId,
  }
}

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const formData = await request.formData()
  const action = formData.get("action")

  if (action === "resetDeliberation") {
    const deliberationId = Number(params.deliberationId)!

    await db.$transaction([
      db.valuesCard.deleteMany({
        where: { deliberationId },
      }),
      db.canonicalValuesCard.deleteMany({
        where: { deliberationId },
      }),
      db.deliberation.update({
        where: { id: deliberationId },
        data: { setupStatus: "ready" },
      }),
    ])

    return json({ success: true, refetch: true })
  } else if (action === "deleteDeliberation") {
    const deliberationId = Number(params.deliberationId)!
    await db.deliberation.delete({
      where: { id: deliberationId },
    })
    return redirect("/dashboard")
  } else if (action === "removeContext") {
    const contextId = formData.get("contextId") as string
    const questionId = formData.get("questionId") as string

    await db.contextsForQuestions.delete({
      where: {
        contextId_questionId_deliberationId: {
          contextId: contextId,
          questionId: Number(questionId),
          deliberationId: Number(params.deliberationId)!,
        },
      },
    })

    return json({ success: true })
  } else if (action === "addContext") {
    const name = formData.get("name") as string
    const application = formData.get("application") as string
    const questionId = formData.get("questionId") as string
    const deliberationId = Number(params.deliberationId)!

    await db.context.create({
      data: {
        id: name,
        deliberation: { connect: { id: deliberationId } },
        ContextsForQuestions: {
          create: {
            question: { connect: { id: Number(questionId) } },
            application: application,
          },
        },
      },
    })

    return json({ success: true })
  } else if (action === "simulateParticipants") {
    const deliberationId = Number(params.deliberationId)!
    const articulateOnly = formData.get("articulateOnly") === "true"
    const inlinePersonasRaw = formData.get("inlinePersonas")
    const personasSlugs = formData.get("personas") as string | null

    const eventData: any = {
      deliberationId,
      articulateOnly,
      voteLimit: 5,
    }
    if (typeof inlinePersonasRaw === "string" && inlinePersonasRaw.length) {
      try {
        eventData.inlinePersonas = JSON.parse(inlinePersonasRaw)
      } catch {
        return json(
          { error: "Could not parse inlinePersonas JSON" },
          { status: 400 }
        )
      }
    } else {
      eventData.personas = personasSlugs || "6"
    }
    await inngest.send({
      name: "simulate-deliberation",
      data: eventData,
    })
    return json({ success: true, simulationStarted: true, refetch: true })
  }
}

function ValueContextInfo() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center">
            <h4 className="text-sm font-semibold mr-1.5">Value Contexts</h4>
            <QuestionMarkCircledIcon className="h-4 w-4" />
            <span className="sr-only">Value</span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="w-80 p-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Value Contexts</h3>
            <p className="text-sm">
              Often when we disagree about values, we're actually disagreeing
              about the specific situations to which those values apply.
            </p>
            <p className="text-sm">
              For example, two people might disagree about immigration policies
              in general, but agree on how to handle the case of an immigrant
              who's lived in the country for 20 years.
            </p>
            <h4 className="font-semibold text-sm mt-4">How It Works</h4>
            <ul className="list-disc list-inside text-sm space-y-1">
              <li>
                Value contexts are generated automatically in the background.
              </li>
              <li>
                The final graph shows the wisest value for each value context
                for your question.
              </li>
              <li>This helps bridge disagreements and find common ground.</li>
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default function DeliberationDashboard() {
  const { deliberation, interventionsCount, firstQuestionId } =
    useLoaderData<typeof loader>()
  const fetcher = useFetcher()
  const revalidator = useRevalidator()
  const { deliberationId } = useParams()
  const [openQuestionId, setOpenQuestionId] = useState<number | null>(null)
  const [simulateDialogOpen, setSimulateDialogOpen] = useState(false)

  // Poll for setup status if the deliberation is not ready
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null
    if (deliberation.setupStatus !== "ready") {
      intervalId = setInterval(() => {
        revalidator.revalidate()
      }, 5000)
    }
    return () => {
      if (intervalId !== null) clearInterval(intervalId)
    }
  }, [deliberation.setupStatus, revalidator])

  // Revalidate when the fetcher data changes
  useEffect(() => {
    console.log(fetcher.data)
    if (fetcher.data && (fetcher.data as any)?.refetch) {
      revalidator.revalidate()
    }
  }, [fetcher.data, revalidator])

  const handleDeleteDeliberation = () => {
    if (confirm("Are you sure you want to delete this deliberation?")) {
      fetcher.submit({ action: "deleteDeliberation" }, { method: "post" })
    }
  }

  const toggleQuestionDropdown = (questionId: number) => {
    setOpenQuestionId(openQuestionId === questionId ? null : questionId)
  }

  const handleResetDeliberation = () => {
    if (
      confirm(
        "Are you sure you want to reset this deliberation? This will clear all progress."
      )
    ) {
      fetcher.submit({ action: "resetDeliberation" }, { method: "post" })
    }
  }

  return (
    <div className="container mx-auto py-6 max-w-2xl space-y-6">
      {deliberation.topic && (
        <h1 className="text-3xl font-bold mb-8">{deliberation.topic}</h1>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Options</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <nav className="space-y-2 text-sm font-medium">
            <Link
              to={`/dashboard/${deliberationId}/edit`}
              prefetch="render"
              className="flex items-center rounded-lg px-3 py-2 text-slate-900 hover:bg-slate-100  "
            >
              <span>Edit Deliberation</span>
              <ChevronRightIcon className="ml-auto h-4 w-4 text-slate-400" />
            </Link>
            <Link
              to={`/dashboard/${deliberationId}/values`}
              prefetch="render"
              className="flex items-center rounded-lg px-3 py-2 text-slate-900 hover:bg-slate-100  "
            >
              <span>Manage Values</span>
              <ChevronRightIcon className="ml-auto h-4 w-4 text-slate-400" />
            </Link>
            <Link
              to={`/dashboard/${deliberationId}/hypotheses`}
              prefetch="render"
              className="flex items-center rounded-lg px-3 py-2 text-slate-900 hover:bg-slate-100  "
            >
              <span>Manage Hypotheses</span>
              <ChevronRightIcon className="ml-auto h-4 w-4 text-slate-400" />
            </Link>
            <Link
              to={`/dashboard/${deliberationId}/votes`}
              prefetch="render"
              className="flex items-center rounded-lg px-3 py-2 text-slate-900 hover:bg-slate-100  "
            >
              <span>Manage Votes</span>
              <ChevronRightIcon className="ml-auto h-4 w-4 text-slate-400" />
            </Link>
            <Link
              to={`/dashboard/${deliberationId}/chats`}
              prefetch="intent"
              className="flex items-center rounded-lg px-3 py-2 text-slate-900 hover:bg-slate-100  "
            >
              <span>Manage Chats</span>
              <ChevronRightIcon className="ml-auto h-4 w-4 text-slate-400" />
            </Link>
          </nav>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Summary</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-4">
            <div className="flex justify-between items-center mt-4">
              <div>
                <h4 className="text-sm font-semibold">Participants</h4>
                <p className="text-sm text-muted-foreground mt-2">
                  How many participants have entered the deliberation.
                </p>
              </div>
              <p className="text-lg font-medium">{deliberation.chats.length}</p>
            </div>
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-sm font-semibold">Values</h4>
                <p className="text-sm text-muted-foreground mt-2">
                  How many values cards have been articulated.
                </p>
              </div>
              <p className="text-lg font-medium">
                {deliberation._count.canonicalValuesCards}
              </p>
            </div>
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-sm font-semibold">Upgrades</h4>
                <p className="text-sm text-muted-foreground mt-2">
                  How many upgrades have been agreed upon.
                </p>
              </div>
              <p className="text-lg font-medium">{deliberation._count.edges}</p>
            </div>
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-sm font-semibold">Upgrade Stories</h4>
                <p className="text-sm text-muted-foreground mt-2">
                  How many upgrade stories have been generated.
                </p>
              </div>
              <p className="text-lg font-medium">
                {deliberation._count.edgeHypotheses}
              </p>
            </div>
          </div>
          {deliberation._count.canonicalValuesCards === 0 &&
            deliberation.setupStatus === "ready" && (
              <Alert className="mt-6 mb-4 bg-slate-50">
                <div className="flex flex-row space-x-2 mb-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No responses yet</AlertTitle>
                </div>
                <AlertDescription>
                  Click <b>Simulate Participants</b> below to seed this
                  deliberation with persona-driven chats, values cards, and
                  upgrade stories.
                </AlertDescription>
              </Alert>
            )}
          <SimulationProgressPanel
            deliberationId={Number(deliberationId)}
            simulating={deliberation.setupStatus === "generating_graph"}
          />
          <div className="mt-8 flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 sm:space-x-4">
            <Link
              to={`/deliberation/${deliberationId}/graph`}
              prefetch="intent"
              className="w-full sm:w-auto"
            >
              <Button variant="outline" className="w-full sm:w-auto">
                Show Graph
              </Button>
            </Link>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={
                fetcher.state !== "idle" ||
                deliberation.setupStatus === "generating_graph"
              }
              onClick={() => setSimulateDialogOpen(true)}
            >
              {deliberation.setupStatus === "generating_graph" ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Simulating…
                </span>
              ) : (
                "Simulate Participants"
              )}
            </Button>
            <SimulateDialog
              open={simulateDialogOpen}
              onOpenChange={setSimulateDialogOpen}
              onSubmit={(personas: DialogPersona[]) => {
                setSimulateDialogOpen(false)
                fetcher.submit(
                  {
                    action: "simulateParticipants",
                    inlinePersonas: JSON.stringify(personas),
                  },
                  { method: "post" }
                )
              }}
            />
            <Link
              to={`/deliberation/${deliberation.id}/start`}
              prefetch="intent"
              className="w-full sm:w-auto"
            >
              <Button className="w-full sm:w-auto">
                Show Participant View
              </Button>
            </Link>
          </div>
          {(fetcher.data as any)?.simulationStarted && (
            <Alert className="mt-4 bg-slate-50">
              <AlertTitle>Simulation queued</AlertTitle>
              <AlertDescription>
                Simulated participants are being run in the background. The
                progress bar above shows the current stage.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mt-8 mb-4">
        <h2 className="text-2xl font-bold">Questions</h2>
        {(deliberation.setupStatus === "generating_contexts" ||
          deliberation.setupStatus === "generating_questions") && (
          <div className="bg-white rounded-md px-2 py-1 border flex flex-row items-center gap-1">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            <span className="text-gray-400 text-sm">
              {deliberation.setupStatus === "generating_contexts"
                ? "Generating Contexts"
                : "Generating Questions"}
            </span>
          </div>
        )}
      </div>

      {deliberation.questions.length === 0 && (
        <Alert className="mt-6 mb-4">
          <div className="flex flex-row space-x-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="mb-2">No questions yet</AlertTitle>
          </div>

          <AlertDescription className="flex flex-col sm:flex-row items-center justify-between mt-2">
            Questions will appear here when ready
          </AlertDescription>
        </Alert>
      )}

      {deliberation.questions.map((question, index) => (
        <Card key={question.id}>
          <CardHeader>
            <CardTitle className="text-md font-bold flex items-center">
              {question.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">{question.question}</p>
            <div
              className="flex items-center justify-between mb-2 cursor-pointer hover:bg-gray-100 rounded-md p-2 transition-colors duration-200"
              onClick={() => toggleQuestionDropdown(question.id)}
            >
              <div className="flex flex-row items-center">
                <ValueContextInfo />
              </div>
              <ChevronDownIcon
                className={`h-4 w-4 transition-transform ${
                  openQuestionId === question.id ? "transform rotate-180" : ""
                }`}
              />
            </div>
            {openQuestionId === question.id && (
              <ul className="space-y-2">
                {question.ContextsForQuestions.map((context, index) => (
                  <li
                    key={index}
                    className="flex flex-col bg-gray-50 p-2 rounded-md"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">
                        {context.context.id}
                      </span>
                      {context.context.createdInChatId && (
                        <div className="flex items-center gap-1 text-gray-500 whitespace-nowrap ml-2">
                          <span className="text-xs">Articulated by user</span>
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    {context.application && (
                      <span className="text-xs text-gray-600 mt-1">
                        {context.application}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
      <div className="mt-12 flex justify-between">
        <LoadingButton
          variant="outline"
          onClick={handleResetDeliberation}
          disabled={fetcher.state !== "idle"}
        >
          Reset Deliberation
        </LoadingButton>
        <LoadingButton
          variant="destructive"
          onClick={handleDeleteDeliberation}
          disabled={fetcher.state !== "idle"}
        >
          Delete Deliberation
        </LoadingButton>
      </div>
    </div>
  )
}

type SimulationProgress = {
  stage:
    | "starting"
    | "articulating"
    | "deduping"
    | "hypothesizing"
    | "voting"
    | "done"
    | "failed"
  stageIndex: number
  stageCount: number
  personasTotal: number
  personasArticulated: number
  personasVoted: number
  startedAt: number
  estimatedSeconds: number
  message: string
  runId: string
}

function SimulationProgressPanel({
  deliberationId,
  simulating,
}: {
  deliberationId: number
  simulating: boolean
}) {
  const [progress, setProgress] = useState<SimulationProgress | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Poll the progress endpoint every 3s while simulating, plus once on mount
  // so we surface stale "done" progress from the last run.
  useEffect(() => {
    let cancelled = false
    const fetchOnce = async () => {
      try {
        const r = await fetch(`/api/simulation/${deliberationId}/progress`)
        if (!r.ok) return
        const data = (await r.json()) as { progress: SimulationProgress | null }
        if (!cancelled) setProgress(data.progress)
      } catch {}
    }
    fetchOnce()
    if (!simulating) return
    const interval = setInterval(fetchOnce, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [deliberationId, simulating])

  // Tick a clock for the elapsed-time and progress-bar render.
  useEffect(() => {
    if (!simulating) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [simulating])

  if (!progress) return null
  // Hide done/failed progress if the deliberation isn't currently simulating
  // and the last run finished more than 30s ago — keeps the UI clean.
  if (
    !simulating &&
    (progress.stage === "done" || progress.stage === "failed") &&
    Date.now() - progress.startedAt > 30_000
  ) {
    return null
  }

  const elapsedSec = Math.max(0, Math.floor((now - progress.startedAt) / 1000))
  const fraction =
    progress.stage === "done"
      ? 1
      : progress.stageCount > 0
      ? Math.min(0.99, progress.stageIndex / progress.stageCount)
      : 0
  // For articulate/vote stages, refine fraction with persona progress.
  let refined = fraction
  if (progress.stage === "articulating" && progress.personasTotal > 0) {
    const stageStart = STAGE_FRACTIONS.articulating
    const stageWidth = STAGE_FRACTIONS.deduping - STAGE_FRACTIONS.articulating
    refined =
      stageStart + (progress.personasArticulated / progress.personasTotal) * stageWidth
  } else if (progress.stage === "voting" && progress.personasTotal > 0) {
    const stageStart = STAGE_FRACTIONS.voting
    const stageWidth = STAGE_FRACTIONS.done - STAGE_FRACTIONS.voting
    refined =
      stageStart + (progress.personasVoted / progress.personasTotal) * stageWidth
  } else {
    refined = STAGE_FRACTIONS[progress.stage]
  }
  const pct = Math.round(refined * 100)

  const eta = Math.max(0, progress.estimatedSeconds - elapsedSec)

  return (
    <div className="mt-6 mb-2 rounded-md border bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {progress.stage === "done" ? (
            <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
          ) : progress.stage === "failed" ? (
            <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
          )}
          <span className="text-sm font-medium">
            {STAGE_LABELS[progress.stage]}
          </span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {progress.stage === "done"
            ? `done in ${formatDuration(elapsedSec)}`
            : `${formatDuration(elapsedSec)} elapsed · ~${formatDuration(eta)} left`}
        </span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded bg-slate-200">
        <div
          className={`h-full transition-all duration-500 ${
            progress.stage === "failed" ? "bg-red-500" : "bg-emerald-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        {progress.message}
      </div>
    </div>
  )
}

const STAGE_LABELS: Record<SimulationProgress["stage"], string> = {
  starting: "Starting…",
  articulating: "Personas articulating values",
  deduping: "Clustering values into canonical cards",
  hypothesizing: "Generating transition stories",
  voting: "Personas voting on transitions",
  done: "Simulation complete",
  failed: "Simulation failed",
}

const STAGE_FRACTIONS: Record<SimulationProgress["stage"], number> = {
  starting: 0,
  articulating: 0.05,
  deduping: 0.55,
  hypothesizing: 0.7,
  voting: 0.85,
  done: 1,
  failed: 1,
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}
