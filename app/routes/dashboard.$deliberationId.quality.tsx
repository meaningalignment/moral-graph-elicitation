import { LoaderFunctionArgs, json } from "@remix-run/node"
import { useLoaderData } from "@remix-run/react"
import { auth, db } from "~/config.server"
import { Card, CardHeader, CardTitle, CardContent } from "~/components/ui/card"

export async function loader({ request, params }: LoaderFunctionArgs) {
  if ((await auth.getCurrentUser(request))?.isAdmin !== true) {
    throw new Response("Unauthorized", { status: 401 })
  }
  const deliberationId = Number(params.deliberationId)

  // Awaited directly. defer() doesn't stream on Vercel's Node runtime.
  const [
    canonicalCards,
    valuesCards,
    edges,
    edgeHypotheses,
    simulatedUsers,
    stories,
  ] = await Promise.all([
    db.canonicalValuesCard.count({
      where: { deliberationId, isArchived: false },
    }),
    db.valuesCard.count({ where: { deliberationId } }),
    db.edge.count({ where: { deliberationId } }),
    db.edgeHypothesis.count({
      where: { deliberationId, isArchived: false },
    }),
    db.user.count({ where: { role: { has: "SIMULATED" } } }),
    db.edgeHypothesis.findMany({
      where: { deliberationId, isArchived: false, story: { not: null } },
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        from: { select: { title: true } },
        to: { select: { title: true } },
      },
    }) as Promise<any[]>,
  ])

  const counts = {
    canonicalCards,
    valuesCards,
    edges,
    edgeHypotheses,
    simulatedUsers,
  }

  return json({ counts, stories, deliberationId })
}

export default function QualityDashboard() {
  const { counts, stories } = useLoaderData<typeof loader>()

  return (
    <div className="container mx-auto py-6 max-w-4xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Quality Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Diagnostics for deduplication and transition stories on this
          deliberation. Use this alongside <code>npm run test:pipeline</code> for
          a full picture.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Counts</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1">
            <li>
              Canonical values cards: <b>{counts.canonicalCards}</b>
            </li>
            <li>
              Articulated values cards: <b>{counts.valuesCards}</b>
            </li>
            <li>
              Edge hypotheses (transition stories):{" "}
              <b>{counts.edgeHypotheses}</b>
            </li>
            <li>
              Edge votes: <b>{counts.edges}</b>
            </li>
            <li>
              Simulated users (whole DB): <b>{counts.simulatedUsers}</b>
            </li>
          </ul>
          <p className="text-xs text-muted-foreground mt-3">
            For dedup quality, run <code>npm run dedup:dryrun -- --deliberation $id</code>
            {" "}— it clusters this deliberation's cards with the production
            partitioner and grades each cluster against the in-repo judge.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sample transition stories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No transition stories yet.
            </p>
          ) : (
            stories.map((s: any, i: number) => (
              <div
                key={`${s.fromId}-${s.toId}-${i}`}
                className="border rounded-md p-3 bg-muted"
              >
                <div className="text-xs text-muted-foreground">
                  Context: {s.contextId}
                </div>
                <div className="font-semibold text-sm">
                  {s.from?.title} → {s.to?.title}
                </div>
                <p className="text-sm mt-2 whitespace-pre-line">{s.story}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
