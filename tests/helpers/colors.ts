/** Tiny ANSI helpers for human-readable script output. */
export const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
}
export const pass = (s: string) => `${c.green}✓${c.reset} ${s}`
export const fail = (s: string) => `${c.red}✗${c.reset} ${s}`
export const warn = (s: string) => `${c.yellow}⚠${c.reset} ${s}`
export const head = (s: string) => `${c.bold}${c.cyan}${s}${c.reset}`
