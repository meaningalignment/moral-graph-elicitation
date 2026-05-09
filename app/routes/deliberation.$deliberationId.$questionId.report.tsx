import { useEffect, useState, useMemo, useCallback } from "react"
import { Card, CardContent, CardFooter, CardHeader } from "~/components/ui/card"
import { Separator } from "~/components/ui/separator"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { LoaderFunctionArgs, ActionFunction, json } from "@remix-run/node"
import { auth, db } from "~/config.server"
import { useLoaderData, Link, useParams, useFetcher } from "@remix-run/react"
import {
  type MoralGraph,
  type MoralGraphEdge,
  type MoralGraphValue,
} from "~/lib/values-tools"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { Intervention, InterventionPrecedence } from "@prisma/client"
import { contextDisplayName, getFavicon } from "~/lib/utils"
import { updateInterventionText } from "~/services/interventions"
import { Loader2, MessageCircle, Heart, ThumbsUp } from "lucide-react"
import { ScrollingBadges } from "~/components/badge-carousel"
import ValuesCardDialog from "~/components/values-card-dialog"
import VoteCardDialog from "~/components/vote-card-dialog"
import ContextDialog from "~/components/context-dialog"

type InterventionWithPrecedence = Intervention & {
  InterventionPrecedence: InterventionPrecedence[]
}

type Node = MoralGraphValue & {
  x: number
  y: number
  group: number
  normalizedScore: number
  isWinningValue: boolean
}

type Edge = MoralGraphEdge & {
  source: Node
  target: Node
  color: string
}

function categorizeSupportLevel(
  pageRankValues: number[]
): "broadly supported" | "some support" | "contested" {
  if (pageRankValues.length < 2) {
    throw new Error("Need at least 2 values to categorize support level")
  }

  // Sort values in descending order
  const sortedValues = [...pageRankValues].sort((a, b) => b - a)
  const winner = sortedValues[0]
  const runnerUp = sortedValues[1]

  // Calculate statistical measures
  const mean =
    sortedValues.reduce((sum, val) => sum + val, 0) / sortedValues.length
  const variance =
    sortedValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    sortedValues.length
  const stdDev = Math.sqrt(variance)

  // Calculate key metrics
  const standardDeviations = stdDev === 0 ? 0 : (winner - mean) / stdDev
  const gapRatio = runnerUp === 0 ? Infinity : winner / runnerUp

  // Determine category based on stricter metrics
  if (standardDeviations > 2.5 && gapRatio > 2.0) {
    return "broadly supported"
  } else if (standardDeviations > 1.5 || gapRatio > 1.5) {
    return "some support"
  } else {
    return "contested"
  }
}

function convertMoralGraphToForceGraph(moralGraph: MoralGraph) {
  const maxPageRank = Math.max(...moralGraph.values.map((v) => v.pageRank || 0))
  const minPageRank = Math.min(...moralGraph.values.map((v) => v.pageRank || 0))

  // Sort values by pageRank and take top 6
  const topValues = [...moralGraph.values].sort(
    (a, b) => (b.pageRank || 0) - (a.pageRank || 0)
  )
  // .slice(0, 6)

  // Find the winning value
  const winningValue = topValues[0]

  // Helper function to find all connected nodes
  function findConnectedNodes(
    valueId: string,
    visited = new Set<string>()
  ): Set<string> {
    if (visited.has(valueId)) return visited
    visited.add(valueId)

    // Find all edges connected to this value
    moralGraph.edges
      .filter(
        (edge) =>
          (String(edge.sourceValueId) === valueId ||
            String(edge.wiserValueId) === valueId) &&
          topValues.some((v) => v.id === edge.sourceValueId) &&
          topValues.some((v) => v.id === edge.wiserValueId)
      )
      .forEach((edge) => {
        const nextNodeId =
          String(edge.sourceValueId) === valueId
            ? edge.wiserValueId
            : edge.sourceValueId
        findConnectedNodes(String(nextNodeId), visited)
      })

    return visited
  }

  // Get all nodes connected to winning value
  const connectedNodeIds = findConnectedNodes(String(winningValue.id))

  // Filter top values to only include connected nodes
  const connectedValues = topValues.filter((value) =>
    connectedNodeIds.has(String(value.id))
  )

  const nodes: Node[] = connectedValues.map((value) => ({
    ...value,
    x: 0,
    y: 0,
    group: value.pageRank ? Math.floor(value.pageRank * 4) + 1 : 1,
    isWinningValue: value.pageRank === maxPageRank,
    normalizedScore:
      maxPageRank === minPageRank
        ? 1
        : ((value.pageRank || 0) - minPageRank) / (maxPageRank - minPageRank),
  }))

  // Create links with colors based on political affiliation
  const links: Edge[] = moralGraph.edges
    .filter(
      (edge) =>
        connectedNodeIds.has(String(edge.sourceValueId)) &&
        connectedNodeIds.has(String(edge.wiserValueId))
    )
    .map((edge) => {
      const sourceValue = nodes.find((n) => n.id === edge.sourceValueId)
      const targetValue = nodes.find((n) => n.id === edge.wiserValueId)

      if (!sourceValue || !targetValue) {
        throw new Error("Invalid edge references")
      }

      // Set color based on dominant political affiliation
      let color = "gray" // default color
      if (
        (edge.summary as any)?.demographics?.mainUsPoliticalAffiliation ===
        "Republican"
      ) {
        color = "red"
      } else if (
        (edge.summary as any)?.demographics?.mainUsPoliticalAffiliation ===
        "Democrat"
      ) {
        color = "blue"
      }

      return {
        ...edge,
        source: sourceValue,
        target: targetValue,
        color,
      }
    })

  return { nodes, links }
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { deliberationId, questionId } = params

  const user = await auth.getCurrentUser(request)
  const deliberation = await db.deliberation.findFirstOrThrow({
    where: { id: Number(deliberationId!) },
  })

  const question = await db.question.findFirstOrThrow({
    where: { id: Number(questionId!) },
  })

  const interventions = await db.intervention.findMany({
    where: {
      deliberationId: Number(deliberationId!),
      questionId: Number(questionId!),
      shouldDisplay: true,
    },
    include: {
      InterventionPrecedence: true,
    },
  })

  return {
    interventions,
    isOwner: user?.id === deliberation.createdBy,
    question: question.question,
  }
}

// Define a function to determine height
function getGraphHeight(intervention: InterventionWithPrecedence): number {
  return intervention.InterventionPrecedence.length > 0 ? 300 : 250
}

function ForceGraphWrapper({
  graphData,
  selectedValue,
  selectedLink,
  setSelectedValue,
  setSelectedLink,
  intervention,
}: {
  graphData: MoralGraph
  selectedValue: Node | null
  selectedLink: Edge | null
  setSelectedValue: (value: Node | null) => void
  setSelectedLink: (link: Edge | null) => void
  intervention: InterventionWithPrecedence
}) {
  const { deliberationId } = useParams()
  const [ForceGraph, setForceGraph] = useState<any>(null)
  const isDialogOpen = selectedValue || selectedLink

  // Memoize the converted graph data
  const forceGraphData = useMemo(
    () => convertMoralGraphToForceGraph(graphData),
    [graphData]
  )

  useEffect(() => {
    import("react-force-graph-2d").then((module) => {
      setForceGraph(() => module.default)
    })
  }, [])

  // Memoize the node canvas object function
  const nodeCanvasObject = useCallback(
    (node: Node, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.title
      const fontSize = 12 / globalScale
      ctx.font = `${node.isWinningValue ? "bold" : ""} ${fontSize}px Sans-Serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillStyle = node.isWinningValue
        ? `rgb(0, 0, 0)`
        : `rgb(128, 128, 128)`

      ctx.fillText(String(label), node.x, node.y)
    },
    []
  )

  const graphHeight = getGraphHeight(intervention)

  if (!ForceGraph) {
    return <div className="h-[200px] bg-muted rounded-lg" />
  }

  return (
    <div className="relative">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <ForceGraph
                graphData={forceGraphData}
                nodeAutoColorBy={() => "other"}
                nodeColor={() => "gray"}
                linkColor={(link: { color: string }) => link.color}
                linkDirectionalParticles={4}
                linkDirectionalParticleSpeed={(link: any) => {
                  const targetNode = forceGraphData.nodes.find(
                    (node) => node.id === link.target.id
                  )
                  return targetNode
                    ? 0.001 + targetNode.normalizedScore * 0.009
                    : 0.005
                }}
                linkDirectionalParticleWidth={2}
                nodeCanvasObject={nodeCanvasObject}
                linkDistance={100}
                d3VelocityDecay={0.3}
                d3AlphaDecay={0.02}
                d3Force="charge"
                d3ForceStrength={-1000}
                width={450}
                height={graphHeight}
                enableZoomInteraction={!selectedLink && !selectedValue}
                enableDragInteraction={!selectedLink && !selectedValue}
                enableNodeDrag={!selectedLink && !selectedValue}
                onNodeClick={(node: Node) => {
                  if (!selectedLink && !selectedValue) {
                    setSelectedValue(node)
                  }
                }}
                onLinkClick={(link: Edge) => {
                  if (!isDialogOpen) {
                    setSelectedLink(link)
                  }
                }}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Click on a value or connection to learn more</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Link
        prefetch="intent"
        to={`/deliberation/${deliberationId}/graph?contextId=${encodeURIComponent(
          intervention.contextId
        )}`}
        className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground"
      >
        View Full Graph
      </Link>
    </div>
  )
}

function countVotes(graph: MoralGraph): number {
  return graph.edges
    .map(
      (e) =>
        e.counts.markedLessWise +
        e.counts.markedNotWiser +
        e.counts.markedUnsure +
        e.counts.markedWiser
    )
    .reduce((a, b) => a + b, 0)
}

function countAllVotes(
  interventions: Omit<Intervention, "createdAt" | "updatedAt">[]
): number {
  return interventions
    .map((i) => i.graph as unknown as MoralGraph)
    .map(countVotes)
    .reduce((a, b) => a + b, 0)
}

function countAllValues(
  interventions: Omit<Intervention, "createdAt" | "updatedAt">[]
): number {
  return new Set(
    interventions
      .map((i) => i.graph as unknown as MoralGraph)
      .flatMap((g) => g.values.map((v) => v.id))
  ).size
}

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData()
  const type = formData.get("type")

  switch (type) {
    case "regenerate":
      const id = Number(formData.get("interventionId"))
      const intervention = await db.intervention.findUniqueOrThrow({
        where: { id },
      })
      await updateInterventionText(intervention)
      return json({ success: true })
    default:
      return json({ error: "Unknown action type" }, { status: 400 })
  }
}

function findNodeById(interventions: any[], nodeId: number) {
  return interventions
    .flatMap((i) => (i.graph as unknown as MoralGraph).values)
    .find((v) => v.id === nodeId)
}

function getSupportLevelScore(
  supportLevel: "broadly supported" | "some support" | "contested"
): number {
  switch (supportLevel) {
    case "broadly supported":
      return 3
    case "some support":
      return 2
    case "contested":
      return 1
  }
}

function InterventionCard({
  intervention,
  isOwner,
  fetcher,
}: {
  intervention: InterventionWithPrecedence
  isOwner: boolean
  fetcher: any
}) {
  const graph = intervention.graph as unknown as MoralGraph
  const supportLevel = categorizeSupportLevel(
    graph.values.map((v) => v.pageRank!)
  )

  const variants = {
    "broadly supported": "default",
    "some support": "secondary",
    contested: "outline",
  } as const

  const tooltipText = {
    "broadly supported":
      "One value is ranked as most important by participants with a clear margin",
    "some support": "One value is leading, but not by a huge margin",
    contested: "Multiple values are competing for importance",
  }

  const cardHeight = getGraphHeight(intervention)

  return (
    <Card
      className="flex flex-col relative shadow-md hover:shadow-lg transition-shadow"
      style={{ height: `${cardHeight}px` }}
    >
      <CardContent className="pt-6 flex-1 overflow-auto grow">
        <p>{intervention.text}</p>

        {intervention.InterventionPrecedence.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              Similar existing interventions
            </h4>
            <div className="flex flex-wrap gap-2">
              {intervention.InterventionPrecedence.map((precedence) => (
                <TooltipProvider key={precedence.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={precedence.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center"
                      >
                        <Badge
                          variant="secondary"
                          className="gap-2 hover:bg-secondary/80"
                        >
                          <img
                            src={getFavicon(precedence.link)}
                            alt=""
                            className="w-4 h-4"
                          />
                          {new URL(precedence.link).hostname.replace(
                            "www.",
                            ""
                          )}
                        </Badge>
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-[300px] whitespace-pre-wrap">
                        {precedence.description || "View source"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between items-center">
        <div className="flex gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant={variants[supportLevel]} className="capitalize">
                  {supportLevel}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>{tooltipText[supportLevel]}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {isOwner && (
          <Button
            variant="outline"
            size="sm"
            disabled={fetcher.state === "submitting"}
            onClick={() => {
              fetcher.submit(
                {
                  type: "regenerate",
                  interventionId: intervention.id,
                },
                { method: "post" }
              )
            }}
          >
            {fetcher.state === "submitting" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Regenerate"
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

export default function ReportView() {
  const {
    interventions: unsortedInterventions,
    isOwner,
    question,
  } = useLoaderData<typeof loader>()
  const { deliberationId, questionId } = useParams()
  const fetcher = useFetcher()

  const [selectedValue, setSelectedValue] = useState<Node | null>(null)
  const [selectedLink, setSelectedLink] = useState<Edge | null>(null)
  const [selectedContext, setSelectedContext] = useState<string | null>(null)

  // Sort interventions by support level and number of values
  const interventions = useMemo(() => {
    return [...unsortedInterventions].sort((a, b) => {
      const graphA = a.graph as unknown as MoralGraph
      const graphB = b.graph as unknown as MoralGraph

      const supportLevelA = categorizeSupportLevel(
        graphA.values.map((v) => v.pageRank!)
      )
      const supportLevelB = categorizeSupportLevel(
        graphB.values.map((v) => v.pageRank!)
      )

      // Compare support levels first
      const supportDiff =
        getSupportLevelScore(supportLevelB) -
        getSupportLevelScore(supportLevelA)
      if (supportDiff !== 0) return supportDiff

      // If support levels are equal, compare number of values
      return graphB.values.length - graphA.values.length
    })
  }, [unsortedInterventions])

  return (
    <div className="container mx-auto px-8 py-8 animate-fade-in">
      <div className="flex flex-col items-center justify-center mb-20 mt-12 space-y-4 max-w-7xl mx-auto">
        <h1 className="text-3xl md:font-serif text-4xl font-semibold tracking-tight text-center leading-tight text-foreground">
          {question}
        </h1>
      </div>

      <div className="mb-16 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Card className="relative overflow-hidden bg-card">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5" />
            <CardHeader className="relative p-6 flex flex-col h-full justify-between">
              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-primary" />
                  <p className="text-sm font-medium text-muted-foreground">Values</p>
                </div>
                <p className="font-serif text-3xl font-semibold tracking-tight text-primary">
                  {countAllValues(interventions)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Values about what's important to participants
                </p>
              </div>
              <ScrollingBadges
                items={
                  interventions
                    .flatMap((i) => (i.graph as unknown as MoralGraph).values)
                    .map((v) => v.title)
                    .filter((v, i, arr) => arr.indexOf(v) === i) as any[]
                }
                onItemClick={(item) => {
                  const value = interventions
                    .flatMap((i) => (i.graph as unknown as MoralGraph).values)
                    .find((v) => v.title === item)
                  if (value) setSelectedValue(value as any)
                }}
              />
            </CardHeader>
          </Card>
          <Card className="relative overflow-hidden bg-card">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5" />
            <CardHeader className="relative p-6 flex flex-col h-full justify-between">
              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-2">
                  <ThumbsUp className="w-5 h-5 text-primary" />
                  <p className="text-sm font-medium text-muted-foreground">Votes</p>
                </div>
                <p className="font-serif text-3xl font-semibold tracking-tight text-primary">
                  {countAllVotes(interventions)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Votes about which values are wiser than others
                </p>
              </div>
              <ScrollingBadges
                items={interventions
                  .flatMap((i) => (i.graph as unknown as MoralGraph).edges)
                  .map((e) => {
                    const sourceNode = findNodeById(
                      interventions,
                      e.sourceValueId
                    )
                    const targetNode = findNodeById(
                      interventions,
                      e.wiserValueId
                    )
                    return `${sourceNode?.title} → ${targetNode?.title}`
                  })}
                onItemClick={(item) => {
                  const [sourceTitle, targetTitle] = item.split(" → ")
                  const edge = interventions
                    .flatMap((i) => (i.graph as unknown as MoralGraph).edges)
                    .find((e) => {
                      const sourceNode = findNodeById(
                        interventions,
                        e.sourceValueId
                      )
                      const targetNode = findNodeById(
                        interventions,
                        e.wiserValueId
                      )
                      return (
                        sourceNode?.title === sourceTitle &&
                        targetNode?.title === targetTitle
                      )
                    })

                  if (edge) {
                    const sourceNode = findNodeById(
                      interventions,
                      edge.sourceValueId
                    )
                    const targetNode = findNodeById(
                      interventions,
                      edge.wiserValueId
                    )

                    setSelectedLink({
                      ...edge,
                      source: sourceNode,
                      target: targetNode,
                    } as any)
                  }
                }}
              />
            </CardHeader>
          </Card>
          <Card className="relative overflow-hidden bg-card">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5" />
            <CardHeader className="relative p-6 flex flex-col h-full justify-between">
              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-primary" />
                  <p className="text-sm font-medium text-muted-foreground">Contexts</p>
                </div>
                <p className="font-serif text-3xl font-semibold tracking-tight text-primary">
                  {interventions.length}
                </p>
                <p className="text-sm text-muted-foreground">
                  Aspects of the question that demand different values
                </p>
              </div>
              <ScrollingBadges
                items={interventions.map((i) =>
                  contextDisplayName(i.contextId)
                )}
                onItemClick={(item) => setSelectedContext(item)}
              />
            </CardHeader>
          </Card>
        </div>

        <div className="flex flex-col items-center text-center space-y-4 mb-16">
          <Button
            size="lg"
            className="px-8 py-6 text-lg bg-primary hover:bg-primary/90 text-white transition-colors"
          >
            <Link
              prefetch="render"
              to={`/deliberation/${deliberationId}/${questionId}/chat-explainer`}
            >
              Add your voice
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            This process takes 10-15 minutes to complete
          </p>
        </div>

        <h2 className="font-serif text-3xl font-semibold tracking-tight mb-2 mt-6 py-0 text-foreground">
          {interventions.length} Suggested Actions
        </h2>
      </div>

      {interventions.map((intervention, index) => (
        <div
          key={index}
          className="animate-fade-in max-w-7xl mx-auto"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          {index > 0 && <Separator className="my-16" />}
          <div className="flex items-center gap-4 mb-4">
            <span className="font-serif text-4xl font-semibold tracking-tight text-primary/20">
              {index + 1}
            </span>
            <h3 className="text-lg font-semibold flex justify-between items-center flex-1">
              {contextDisplayName(intervention.contextId)}
              <span className="text-sm text-muted-foreground">
                {countVotes(intervention.graph as unknown as MoralGraph)}{" "}
                {"Votes"}
              </span>
            </h3>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            <div className="flex-1">
              <p className="text-sm font-normal text-muted-foreground mb-2">
                Intervention
              </p>
              <InterventionCard
                intervention={
                  intervention as unknown as InterventionWithPrecedence
                }
                isOwner={isOwner}
                fetcher={fetcher}
              />
            </div>
            <div className="w-full lg:w-[450px]">
              <p className="text-sm font-normal text-muted-foreground mb-2">
                Values
              </p>
              <div
                className={`bg-muted rounded-lg overflow-hidden shadow-inner hover:shadow-inner-lg`}
              >
                <ForceGraphWrapper
                  selectedValue={selectedValue}
                  selectedLink={selectedLink}
                  setSelectedValue={setSelectedValue}
                  setSelectedLink={setSelectedLink}
                  graphData={intervention.graph as unknown as MoralGraph}
                  intervention={
                    intervention as unknown as InterventionWithPrecedence
                  }
                />
              </div>
            </div>
          </div>
        </div>
      ))}

      <ValuesCardDialog
        open={!!selectedValue}
        value={selectedValue}
        onClose={() => setSelectedValue(null)}
        onLinkClicked={(link) => setSelectedContext(link.contexts[0])}
        links={
          selectedValue
            ? interventions
                .flatMap((i) => (i.graph as unknown as MoralGraph).edges)
                .filter((edge) => edge.wiserValueId === selectedValue.id)
                .map((edge) => ({
                  ...edge,
                  source: findNodeById(interventions, edge.sourceValueId),
                  target: findNodeById(interventions, edge.wiserValueId),
                }))
            : []
        }
      />

      <VoteCardDialog
        open={!!selectedLink}
        link={selectedLink}
        onClickValue={(value) => {
          if (selectedValue) {
            setSelectedLink(null)
          }
          setSelectedValue(value)
        }}
        onClickContext={(contextId) => {
          setSelectedContext(contextId)
        }}
        graphData={interventions[0]?.graph}
        onClose={() => setSelectedLink(null)}
      />

      <ContextDialog
        open={!!selectedContext}
        onClose={() => setSelectedContext(null)}
        question="How could US abortion policy support christian girls considering abortion?"
        contextId={selectedContext || ""}
      />
    </div>
  )
}
