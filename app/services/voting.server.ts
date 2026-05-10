import type { EdgeType } from "@prisma/client"
import { db } from "~/config.server"

/**
 * Cast (or update) one edge vote. Extracted from
 * `app/routes/deliberation.$deliberationId.$questionId.link.tsx:43-73` so
 * both the web UI action and the Agent API endpoint share one upsert path.
 *
 * The composite primary key `(userId, fromId, toId)` makes this idempotent —
 * the same vote re-submitted updates the existing row rather than erroring.
 */
export type CastEdgeVoteArgs = {
  userId: number
  deliberationId: number
  fromId: number
  toId: number
  contextId: string
  type: EdgeType
  story: string
  comment?: string | null
}

export async function castEdgeVote(args: CastEdgeVoteArgs) {
  return db.edge.upsert({
    where: {
      userId_fromId_toId: {
        userId: args.userId,
        fromId: args.fromId,
        toId: args.toId,
      },
    },
    create: {
      comment: args.comment ?? null,
      type: args.type,
      story: args.story,
      user: { connect: { id: args.userId } },
      to: { connect: { id: args.toId } },
      from: { connect: { id: args.fromId } },
      context: {
        connect: {
          id_deliberationId: {
            id: args.contextId,
            deliberationId: args.deliberationId,
          },
        },
      },
      deliberation: { connect: { id: args.deliberationId } },
    },
    update: {
      comment: args.comment ?? null,
      type: args.type,
      story: args.story,
    },
  })
}
