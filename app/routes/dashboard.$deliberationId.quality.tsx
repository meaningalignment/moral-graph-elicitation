import { LoaderFunctionArgs, defer } from "@remix-run/node"
import { Await, Link, useLoaderData, useParams } from "@remix-run/react"
import { Suspense } from "react"
import { auth, db } from "~/config.server"
import { Card, CardHeader, CardTitle, CardContent } from "~/components/ui/card"
import { Skeleton } from "~/components/ui/skeleton"
import { SkeletonText } from "~/components/skeletons"

type ClosestPair = {
  a_id: number
  a_title: string
  b_id: number
  b_title: string
  distance: number
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  // Auth gate has to be synchronous before defer.
  if ((await auth.getCurrentUser(request))?.isAdmin !== true) {
    throw new Response("Unauthorized", { status: 401 })
  }
  const deliberationId = Number(params.deliberationId)

  // Three independent payloads — defer each so the page header renders
  // instantly and each section streams in on its own.
  const counts = (async () => {
    const [
      canonicalCards,
      cardsWithoutEmbedding,
      valuesCards,
      edges,
      edgeHypotheses,
      simulatedUsers,
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
    ])
    return {
      canonicalCards,
      cardsWithoutEmbedding,
      valuesCards,
      edges,
      edgeHypotheses,
      simulatedUsers,
    }
  })()

  const pairs = db.$queryRawUnsafe(`
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
  `) as Promise<ClosestPair[]>

  const stories = db.edgeHypothesis.findMany({
    where: { deliberationId, isArchived: false, story: { not: null } },
    take: 6,
    orderBy: { createdAt: "desc" },
    include: {
      from: { select: { title: true } },
      to: { select: { title: true } },
    },
  }) as Promise<any[]>

  return defer({ counts, pairs, stories, deliberationId })
}

export default function QualityDashboard() {
  const { counts, pairs, stories, deliberationId } =
    useLoaderData<typeof loader>()

  return (
    <div className="container mx-auto py-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Quality Dashboard</h1>
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
          <Suspense
            fallback={
              <ul className="text-sm space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-8" />
                  </li>
                ))}
              </ul>
            }
          >
            <Await resolve={counts}>
              {(c) => (
                <ul className="text-sm space-y-1">
                  <li>
                    Canonical values cards: <b>{c.canonicalCards}</b>
                  </li>
                  <li>
                    Articulated values cards: <b>{c.valuesCards}</b>
                  </li>
                  <li>
                    Edge hypotheses (transition stories):{" "}
                    <b>{c.edgeHypotheses}</b>
                  </li>
                  <li>
                    Edge votes: <b>{c.edges}</b>
                  </li>
                  <li>
                    Cards missing embeddings: <b>{c.cardsWithoutEmbedding}</b>
                  </li>
                  <li>
                    Simulated users (whole DB): <b>{c.simulatedUsers}</b>
                  </li>
                </ul>
              )}
            </Await>
          </Suspense>
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
          <Suspense
            fallback={
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            }
          >
            <Await resolve={pairs}>
              {(rows) =>
                rows.length === 0 ? (
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
                      {rows.map((p) => (
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
                )
              }
            </Await>
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sample transition stories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Suspense
            fallback={
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="border rounded-md p-3 bg-slate-50 space-y-2"
                  >
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-4 w-2/3" />
                    <SkeletonText lines={3} />
                  </div>
                ))}
              </div>
            }
          >
            <Await resolve={stories}>
              {(rows) =>
                rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No transition stories yet.
                  </p>
                ) : (
                  rows.map((s: any, i: number) => (
                    <div
                      key={`${s.fromId}-${s.toId}-${i}`}
                      className="border rounded-md p-3 bg-slate-50"
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
                )
              }
            </Await>
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
