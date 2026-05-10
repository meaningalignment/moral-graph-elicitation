/**
 * Canonical values for `User.role` (a `String[]` column). Documented here so
 * call sites that filter on role don't sprinkle string literals everywhere.
 *
 * - USER: a real human participant (the default).
 * - SIMULATED: a persona created by the simulation harness
 *   (see simulation/runner.ts:ensureSimulatedUser).
 * - AGENT: the representative User row for an Agent (see app/services/agent/users.server.ts).
 *   Owned by an Agent row whose representativeUserId points here.
 * - ADMIN: a human with elevated privileges. Almost always combined with USER.
 */
export const ROLES = {
  USER: "USER",
  SIMULATED: "SIMULATED",
  AGENT: "AGENT",
  ADMIN: "ADMIN",
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const NON_HUMAN_ROLES: Role[] = [ROLES.SIMULATED, ROLES.AGENT]
