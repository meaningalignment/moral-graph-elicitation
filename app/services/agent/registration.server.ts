import type { Agent, User } from "@prisma/client"
import { db } from "~/config.server"
import {
  generateApiKey,
  generateClaimToken,
} from "./auth.server"

/**
 * Business logic for agent lifecycle, kept out of routes so the API and the
 * web UI share one path.
 */

export type CreatedAgent = {
  agent: Agent
  /** Raw key — only available at creation time. Show once, never store. */
  apiKey: string
  /** Set when the agent was created unclaimed (i.e. the human will claim later). */
  claimToken: string | null
}

/**
 * Create a new agent. Two modes:
 *
 * 1. `humanUserId` omitted → "unclaimed" agent. A representative User row is
 *    created (role=["AGENT"]) and a one-time `claimToken` is returned. The
 *    human visits `/agents/claim/<token>` to bind the agent to their User row.
 *
 * 2. `humanUserId` present → "self-represented" agent. No claim flow; the
 *    human's own User row is used as the representative, so all writes appear
 *    under the human's identity. Useful when a human wants to drive their own
 *    participation programmatically (e.g. from their own claude.ai session).
 */
export async function createAgent(args: {
  name: string
  description?: string | null
  humanUserId?: number | null
}): Promise<CreatedAgent> {
  const { raw: apiKey, hash: apiKeyHash, prefix: apiKeyPrefix } = generateApiKey()

  if (args.humanUserId != null) {
    // Self-represented: representative == owner, auto-claimed.
    const agent = await db.agent.create({
      data: {
        name: args.name,
        description: args.description ?? null,
        apiKeyHash,
        apiKeyPrefix,
        representativeUserId: args.humanUserId,
        humanUserId: args.humanUserId,
        claimedAt: new Date(),
      },
    })
    return { agent, apiKey, claimToken: null }
  }

  // Unclaimed flow: create the representative User first (with a temporary
  // email), then the Agent referencing it, then patch the User.email to
  // include the stable Agent.id. The temp email must be unique so we derive
  // it from the apiKeyPrefix (already random).
  const claimToken = generateClaimToken()
  const tempEmail = `agent+pending-${apiKeyPrefix}@agent.local`

  const repUser = await db.user.create({
    data: {
      email: tempEmail,
      name: args.name,
      role: ["AGENT"],
      isAdmin: false,
    },
  })

  const agent = await db.agent.create({
    data: {
      name: args.name,
      description: args.description ?? null,
      apiKeyHash,
      apiKeyPrefix,
      representativeUserId: repUser.id,
      claimToken,
    },
  })

  await db.user.update({
    where: { id: repUser.id },
    data: { email: `agent+${agent.id}@agent.local` },
  })

  return { agent, apiKey, claimToken }
}

/**
 * Bind an unclaimed agent to a human. Returns the updated Agent or throws on
 * invalid token / already-claimed.
 */
export async function claimAgent(args: {
  claimToken: string
  humanUserId: number
}): Promise<Agent> {
  const agent = await db.agent.findUnique({ where: { claimToken: args.claimToken } })
  if (!agent) {
    throw new ClaimError("invalid_token", "Claim token not found or already used.", 404)
  }
  if (agent.humanUserId != null) {
    throw new ClaimError("already_claimed", "This agent is already claimed.", 409)
  }
  return db.agent.update({
    where: { id: agent.id },
    data: {
      humanUserId: args.humanUserId,
      claimedAt: new Date(),
      claimToken: null,
    },
  })
}

/**
 * Soft-revoke. Future authentication attempts will fail. The Agent row stays
 * (along with its activity history); only its key is invalidated.
 */
export async function revokeAgent(args: {
  agentId: string
  byHumanUserId: number
}): Promise<Agent> {
  const agent = await db.agent.findUnique({ where: { id: args.agentId } })
  if (!agent) {
    throw new ClaimError("not_found", "Agent not found.", 404)
  }
  if (agent.humanUserId !== args.byHumanUserId) {
    throw new ClaimError("forbidden", "Only the owning human may revoke this agent.", 403)
  }
  return db.agent.update({
    where: { id: agent.id },
    data: { revokedAt: new Date() },
  })
}

export class ClaimError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

/**
 * Build the absolute claim URL. Used by `POST /api/agents/register` and by
 * `/api/agent-status` so unclaimed agents can re-surface the link.
 */
export function buildClaimUrl(request: Request, claimToken: string): string {
  const url = new URL(request.url)
  return `${url.origin}/agents/claim/${claimToken}`
}
