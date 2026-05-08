import { json, LoaderFunctionArgs } from "@remix-run/node"
import { useLoaderData } from "@remix-run/react"
import { db } from "~/config.server"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { decodeString } from "~/lib/utils"
import StaticChatMessage from "~/components/chat/static-chat-message"
import { cn } from "~/lib/utils"
import { Separator } from "~/components/ui/separator"
import { IconArrowDown } from "~/components/ui/icons"
import ValuesCard from "~/components/values-card"

export async function loader({ params }: LoaderFunctionArgs) {
  const { deliberationId, fromId, toId, contextHash } = params
  const contextId = decodeString(contextHash!)

  const hypothesis = await db.edgeHypothesis.findFirstOrThrow({
    where: {
      deliberationId: Number(deliberationId),
      fromId: Number(fromId),
      toId: Number(toId),
      contextId,
    },
    include: {
      from: true,
      to: true,
      context: true,
    },
  })

  // Get all edges that verify or contradict this hypothesis
  const relatedEdges = await db.edge.findMany({
    where: {
      deliberationId: Number(deliberationId),
      fromId: Number(fromId),
      toId: Number(toId),
    },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  })

  return json({ hypothesis, relatedEdges })
}

export default function HypothesisView() {
  const { hypothesis, relatedEdges } = useLoaderData<typeof loader>()

  return (
    <div className="grid place-items-center space-y-4 py-12 px-8">
      <div className="w-full max-w-2xl mb-6">
        <h1 className="text-md font-bold mb-2 pl-12 md:pl-0">
          {hypothesis.context.id}
        </h1>
        <p className="text-foreground">{hypothesis.story}</p>
      </div>
      <div
        className={cn(
          `grid grid-cols-1 md:grid-cols-3 mx-auto gap-4 items-center justify-items-center md:grid-cols-[max-content,min-content,max-content] mb-4`
        )}
      >
        <ValuesCard card={hypothesis.from!} />
        <IconArrowDown className="h-8 w-8 mx-auto" />
        <ValuesCard card={hypothesis.to!} />
      </div>
      <div className={cn(`w-full flex items-center justify-center py-8`)}>
        <Separator className="max-w-2xl" />
      </div>

      {/* Related edges section */}
      <div className="transition-opacity ease-in duration-500 flex flex-col items-center justify-center w-full max-w-xs">
        <h1 className="font-bold mr-auto">User Responses</h1>
        {relatedEdges.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-4">
            No users have agreed or disagreed with this hypothesis yet.
          </p>
        ) : (
          <div className="w-full space-y-4 mt-4">
            {relatedEdges.map((edge) => (
              <div
                key={`${edge.userId}-${edge.fromId}-${edge.toId}`}
                className="border-b pb-4 last:border-0"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{edge.user.name}</p>
                    <p className="text-sm text-muted-foreground">{edge.user.email}</p>
                  </div>
                  <Badge
                    variant={
                      edge.type === "upgrade"
                        ? "success"
                        : edge.type === "not_sure"
                        ? "warning"
                        : "destructive"
                    }
                  >
                    {edge.type === "upgrade"
                      ? "Agree"
                      : edge.type === "not_sure"
                      ? "Unsure"
                      : "Disagree"}
                  </Badge>
                </div>
                {edge.comment && (
                  <p className="mt-2 text-sm text-muted-foreground">{edge.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
