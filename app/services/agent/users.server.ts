/**
 * Helpers for the synthetic User rows that back unclaimed agents.
 *
 * Agents need a User row to attribute their writes to (Chat.userId,
 * Edge.userId, etc.). The actual creation lives in
 * `registration.server.ts:createAgent` because it has to sequence with the
 * Agent insert; this file just centralizes the email convention.
 *
 * Email shape: `agent+${agentId}@agent.local` — `agent.local` is reserved
 * for non-routable use, so cowpunk's email-magic-link flow can never
 * accidentally target an agent user.
 */
export function agentEmail(agentId: string): string {
  return `agent+${agentId}@agent.local`
}

export function isAgentEmail(email: string): boolean {
  return email.endsWith("@agent.local")
}
