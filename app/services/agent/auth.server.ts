import crypto from "node:crypto"
import type { Agent, User } from "@prisma/client"
import { db } from "~/config.server"

/**
 * Agent API authentication.
 *
 * Format mirrors common conventions: `mge_live_<32 url-safe random chars>`.
 * The raw key is shown to the human exactly once at registration; we store
 * only its sha256 hash, plus a 16-character prefix (`mge_live_xxxxxxx`) so the
 * UI can surface "ends in …" style truncations without ever holding the key.
 *
 * Authentication is pure DB lookup on the unique hash column — no key list
 * iteration, so no timing side-channel beyond what the database itself has.
 */

const KEY_PREFIX = "mge_live_"
const KEY_RANDOM_BYTES = 24 // 32 base64url chars

export type AgentAuthContext = {
  agent: Agent
  representativeUser: User
  humanUser: User | null
  isClaimed: boolean
  /**
   * True when `representativeUserId === humanUserId`, i.e. a human minted a
   * key for their own User row. In that case there's no "agent represents
   * human" distinction; the agent IS the human's interface.
   */
  isSelfRepresented: boolean
}

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const random = crypto.randomBytes(KEY_RANDOM_BYTES).toString("base64url")
  const raw = `${KEY_PREFIX}${random}`
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, 16) }
}

export function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex")
}

/** Generate a one-time claim token (URL-safe, ~24 bytes). */
export function generateClaimToken(): string {
  return crypto.randomBytes(24).toString("base64url")
}

function readApiKey(request: Request): string | null {
  const header = request.headers.get("x-api-key") ?? request.headers.get("X-API-Key")
  if (!header) return null
  const trimmed = header.trim()
  if (!trimmed.startsWith(KEY_PREFIX)) return null
  return trimmed
}

/**
 * Look up the Agent for a request's `X-API-Key`. Returns null on missing /
 * malformed / unknown keys. Bumps `lastSeenAt` as a best-effort.
 */
export async function authenticateAgent(
  request: Request
): Promise<AgentAuthContext | null> {
  const raw = readApiKey(request)
  if (!raw) return null
  const hash = hashApiKey(raw)
  const agent = await db.agent.findUnique({
    where: { apiKeyHash: hash },
    include: { representativeUser: true, humanUser: true },
  })
  if (!agent) return null
  if (agent.revokedAt) return null

  // Best-effort heartbeat ping; never block the request on this.
  db.agent
    .update({ where: { id: agent.id }, data: { lastSeenAt: new Date() } })
    .catch((e) => console.warn("[agent-auth] lastSeenAt update failed:", (e as Error).message))

  const isClaimed = agent.humanUserId != null
  const isSelfRepresented = isClaimed && agent.humanUserId === agent.representativeUserId

  return {
    agent,
    representativeUser: agent.representativeUser,
    humanUser: agent.humanUser,
    isClaimed,
    isSelfRepresented,
  }
}

/**
 * Throws a 401 Response if the key is missing/invalid. Allows unclaimed
 * agents through (e.g. so /api/agent-status can return is_claimed: false).
 */
export async function ensureAgent(request: Request): Promise<AgentAuthContext> {
  const ctx = await authenticateAgent(request)
  if (!ctx) {
    throw new Response(
      JSON.stringify({ error: "unauthorized", message: "Missing or invalid X-API-Key." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    )
  }
  return ctx
}

/**
 * Like `ensureAgent` but additionally requires the agent to have been claimed
 * by a human. Used by every action endpoint.
 */
export async function ensureClaimedAgent(request: Request): Promise<AgentAuthContext> {
  const ctx = await ensureAgent(request)
  if (!ctx.isClaimed) {
    throw new Response(
      JSON.stringify({
        error: "unclaimed_agent",
        message:
          "This agent has not been claimed by a human yet. Visit the claim_url returned at registration.",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    )
  }
  return ctx
}
