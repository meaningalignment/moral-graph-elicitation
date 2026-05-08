import { LoaderFunctionArgs, json } from "@remix-run/node"
import { Link, useLoaderData } from "@remix-run/react"
import { auth, db } from "~/config.server"
import { Card, CardHeader, CardTitle, CardContent } from "~/components/ui/card"

type ClosestPair = {
  a_id: number
  a_title: string
  b_id: number
  b_title: string
  distance: number
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  if ((await auth.getCurrentUser(request))?.isAdmin !== true) {
    throw new Response("Unauthorized", { status: 401 })
  }
  const deliberationId = Number(params.deliberationId)

  // Awaited directly. defer() doesn't stream on Vercel's Node runtime.
  const [
    canonicalCards,
    cardsWithoutEmbedding,
    valuesCards,
    edges,
    edgeHypotheses,
    simulatedUsers,
    pairs,
    stories,
  ] = await Promise.all([
    db.canonicalValuesCard.count({
      where: { deliberationId, isArchived: false },
    }),
    db.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS n FROM "CanonicalValuesCard" WHERE "deliberationId" = ${deliberationId} AND "isArchived" = false AND embedding IS NULL`
    ).then((rows: any) => Number((rows as any[])[0].n)),
    db.valuesCard.count({ where: { deliberationId } }),
    db.edge.count({ where: { deliberationId } }),
    db.edgeHypothesis.count({
      where: { deliberationId, isArchived: false },
    }),
    db.user.count({ where: { role: { has: "SIMULATED" } } }),
    db.$queryRawUnsafe(`
      SELECT a.id AS a_id, a.title AS a_title,
             b.id AS b_id, b.title AS b_title,
             (a.embedding <=> b.embedding) AS distance
      FROM "CanonicalValuesCard" a
      JOIN "CanonicalValuesCard" b ON b.id > a.id AND b."deliberationId" = a."deliberationId"
      WHERE a."deliberationId" = ${deliberationId}
        AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
        AND a."isArchived" = false AND b."isArchived" = false
      ORDER BY distance ASC
      LIMIT 20;
    `) as Promise<ClosestPair[]>,
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
    cardsWithoutEmbedding,
    valuesCards,
    edges,
    edgeHypotheses,
    simulatedUsers,
  }

  return json({ counts, pairs, stories, deliberationId })
}

export default function QualityDashboard() {
  const { counts, pairs, stories, deliberationId } =
    useLoaderData<typeof loader>()

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
              Cards missing embeddings: <b>{counts.cardsWithoutEmbedding}</b>
            </li>
            <li>
              Simulated users (whole DB): <b>{counts.simulatedUsers}</b>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Closest canonical-card pairs (likely missed dedups)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Pairs with cosine distance &lt; 0.05 are flagged in red — likely
            duplicates the pipeline missed.
          </p>
          {pairs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pairs found.</p>
          ) : (
            <table className="text-sm w-full">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th>distance</th>
                  <th>card A</th>
                  <th>card B</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((p) => (
                  <tr
                    key={`${p.a_id}-${p.b_id}`}
                    className={
                      Number(p.distance) < 0.05
                        ? "text-red-600"
                        : Number(p.distance) < 0.1
                        ? "text-yellow-700"
                        : ""
                    }
                  >
                    <td className="pr-4 font-mono">
                      {Number(p.distance).toFixed(4)}
                    </td>
                    <td className="pr-4">
                      <Link
                        prefetch="intent"
                        to={`/dashboard/${deliberationId}/card/${p.a_id}`}
                        className="hover:underline"
                      >
                        {p.a_title}
                      </Link>
                    </td>
                    <td>
                      <Link
                        prefetch="intent"
                        to={`/dashboard/${deliberationId}/card/${p.b_id}`}
                        className="hover:underline"
                      >
                        {p.b_title}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
