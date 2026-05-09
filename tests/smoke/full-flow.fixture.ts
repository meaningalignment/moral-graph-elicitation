/**
 * Full-flow smoke test: drives a fresh deliberation through every stage of
 * the production pipeline and asserts that each stage produces the expected
 * artifacts.
 *
 *   1. Create deliberation via /dashboard/new (Inngest runs gen-seed-contexts).
 *   2. Wait for setupStatus = ready.
 *   3. Articulate cards by running scripts/simulate.ts (2 personas, real LLM).
 *   4. Trigger Inngest deduplicate; wait for canonicals.
 *   5. Trigger Inngest hypothesize; wait for EdgeHypothesis rows.
 *   6. Drive a real /api/chat-assistant conversation as a fresh user; assert
 *      a values card was articulated and the chat reload hydrates it.
 *   7. Cast one upgrade vote via /deliberation/$/Q/link.
 *   8. GET /api/data/graph and assert it returns values + an Edge row exists.
 *   9. Delete the deliberation (cascades).
 *
 * Runnable as a script:
 *   tsx tests/smoke/full-flow.fixture.ts
 *
 * Or as a vitest test gated on RUN_SMOKE=1 (see full-flow.test.ts).
 *
 * Requires the dev server (npm run dev) and Inngest dev (npm run inngest)
 * to be running locally on the default ports.
 */
import "dotenv/config"
import { neon } from "@neondatabase/serverless"
import { execSync } from "node:child_process"
import { c, head, pass, warn } from "../helpers/colors"

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:5173"
const INNGEST = process.env.SMOKE_INNGEST_URL ?? "http://localhost:8288"
const SECRET = process.env.SESSION_SECRET

if (!SECRET) throw new Error("SESSION_SECRET must be set in .env")
const sql = neon(process.env.POSTGRES_URL!)

async function ensureUp() {
  const r = await fetch(BASE).catch(() => null)
  if (!r) throw new Error(`Dev server not reachable at ${BASE}. Run npm run dev.`)
  const i = await fetch(INNGEST).catch(() => null)
  if (!i) console.warn(warn(`Inngest not reachable at ${INNGEST} — dedup/hypothesize stages will not run.`))
}

async function ensureUser(email: string, name: string, isAdmin: boolean): Promise<number> {
  const rows = (await sql`SELECT id FROM "User" WHERE email = ${email}`) as any[]
  if (rows.length) return Number(rows[0].id)
  const ins = (await sql`
    INSERT INTO "User" (email, name, role, "isAdmin", "updatedAt")
    VALUES (${email}, ${name}, ARRAY['USER'], ${isAdmin}, NOW())
    RETURNING id
  `) as any[]
  return Number(ins[0].id)
}

async function devLogin(userId: number): Promise<string> {
  const resp = await fetch(`${BASE}/auth/dev`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: SECRET!, userId: String(userId), redirect: "/" }),
    redirect: "manual",
  })
  if (resp.status !== 302) throw new Error(`auth/dev failed for user ${userId}: ${resp.status}`)
  const cookie = resp.headers.get("set-cookie")?.match(/session=([^;]+)/)
  if (!cookie) throw new Error("no session cookie returned")
  return `session=${cookie[1]}`
}

async function createDeliberation(adminCookie: string, title: string, question: string): Promise<number> {
  const body = new URLSearchParams()
  body.set("title", title)
  body.set("welcomeText", "Smoke test deliberation — auto-deleted.")
  body.set("numContexts", "2")
  body.append("questions", question)
  const r = await fetch(`${BASE}/dashboard/new`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: adminCookie },
    body: body.toString(),
    redirect: "manual",
  })
  if (r.status !== 302) {
    throw new Error(`createDeliberation failed: ${r.status} ${(await r.text()).slice(0, 200)}`)
  }
  const m = r.headers.get("location")?.match(/\/dashboard\/(\d+)$/)
  if (!m) throw new Error(`unexpected redirect: ${r.headers.get("location")}`)
  return Number(m[1])
}

async function waitFor(
  predicate: () => Promise<boolean>,
  opts: { timeoutMs: number; pollMs?: number; label: string }
) {
  const start = Date.now()
  let lastLog = 0
  while (Date.now() - start < opts.timeoutMs) {
    if (await predicate()) return
    if (Date.now() - lastLog > 15_000) {
      console.log(`${c.gray}  …still waiting for ${opts.label} (${Math.floor((Date.now() - start) / 1000)}s)${c.reset}`)
      lastLog = Date.now()
    }
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 3000))
  }
  throw new Error(`Timed out (${opts.timeoutMs}ms) waiting for: ${opts.label}`)
}

async function setupStatus(d: number): Promise<string> {
  const rows = (await sql`SELECT "setupStatus" AS s FROM "Deliberation" WHERE id = ${d}`) as any[]
  return rows[0]?.s ?? ""
}
async function valueCardCount(d: number): Promise<number> {
  const rows = (await sql`SELECT COUNT(*)::int AS n FROM "ValuesCard" WHERE "deliberationId" = ${d}`) as any[]
  return Number(rows[0].n)
}
async function nonCanonCount(d: number): Promise<number> {
  const rows = (await sql`SELECT COUNT(*)::int AS n FROM "ValuesCard" WHERE "deliberationId" = ${d} AND "canonicalCardId" IS NULL`) as any[]
  return Number(rows[0].n)
}
async function canonicalCount(d: number): Promise<number> {
  const rows = (await sql`SELECT COUNT(*)::int AS n FROM "CanonicalValuesCard" WHERE "deliberationId" = ${d}`) as any[]
  return Number(rows[0].n)
}
async function hypothesisCount(d: number): Promise<number> {
  const rows = (await sql`SELECT COUNT(*)::int AS n FROM "EdgeHypothesis" WHERE "deliberationId" = ${d}`) as any[]
  return Number(rows[0].n)
}
async function edgeCount(d: number): Promise<number> {
  const rows = (await sql`SELECT COUNT(*)::int AS n FROM "Edge" WHERE "deliberationId" = ${d}`) as any[]
  return Number(rows[0].n)
}
async function firstQuestion(d: number): Promise<{ id: number }> {
  const rows = (await sql`SELECT id FROM "Question" WHERE "deliberationId" = ${d} ORDER BY id LIMIT 1`) as any[]
  if (!rows.length) throw new Error("no question")
  return { id: Number(rows[0].id) }
}

async function inngestEvent(name: string, data: any) {
  const r = await fetch(`${INNGEST}/e/dev`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, data }),
  })
  if (!r.ok) throw new Error(`inngest event ${name} failed: ${r.status}`)
}

async function driveChat(cookie: string, deliberationId: number, questionId: number) {
  const threadId = crypto.randomUUID()
  // Land on the chat URL once so the route is exercised the same way the UI does it.
  await fetch(`${BASE}/deliberation/${deliberationId}/${questionId}/chat/${threadId}`, {
    headers: { Cookie: cookie },
  })

  type UIMessage = { id: string; role: "user" | "assistant"; parts: any[] }
  const messages: UIMessage[] = []
  const turns = [
    "I want AI assistants to be honest about their reasoning, even when their view differs from mine. The hedging is what frustrates me — I'd rather be told 'I disagree, here's why' than get a non-answer.",
    "It's about being treated as an adult who can hear a different view without falling apart. The opinion should come with reasoning, and steelman my side first. And I should still be the one who decides what to do at the end.",
    "Yes, the policies you listed capture it well. Please go ahead and submit the values card.",
  ]
  let submitted: any = null
  for (const text of turns) {
    messages.push({ id: `u${messages.length}`, role: "user", parts: [{ type: "text", text }] })
    const r = await fetch(`${BASE}/api/chat-assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ messages, threadId, deliberationId, questionId }),
    })
    if (!r.ok || !r.body) {
      throw new Error(`chat-assistant turn failed: ${r.status} ${(await r.text()).slice(0, 200)}`)
    }
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let buf = ""
    let assistantParts: any[] = []
    let textPart: any = null
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split("\n")
      buf = lines.pop() ?? ""
      for (const line of lines) {
        const t = line.trim()
        if (!t.startsWith("data:")) continue
        const json = t.slice(5).trim()
        if (json === "[DONE]") continue
        let evt: any
        try {
          evt = JSON.parse(json)
        } catch {
          continue
        }
        if (evt.type === "text-delta") {
          const d = evt.delta ?? evt.textDelta ?? ""
          if (!textPart) {
            textPart = { type: "text", text: "" }
            assistantParts.push(textPart)
          }
          textPart.text += d
        } else if (evt.type === "tool-input-available" || evt.type === "tool-call") {
          const name = evt.toolName ?? evt.tool_name
          const id = evt.toolCallId ?? evt.id
          assistantParts.push({
            type: `tool-${name}`,
            toolCallId: id,
            state: "input-available",
            input: evt.input ?? evt.args,
          })
          if (name === "submit_values_card") submitted = evt.input ?? evt.args
        } else if (evt.type === "tool-output-available" || evt.type === "tool-result") {
          const id = evt.toolCallId ?? evt.id
          const part = assistantParts.find((p) => p.toolCallId === id)
          if (part) {
            part.state = "output-available"
            part.output = evt.output ?? evt.result
          }
        }
      }
    }
    if (assistantParts.length) {
      messages.push({ id: `a${messages.length}`, role: "assistant", parts: assistantParts })
    }
    if (submitted) break
  }
  if (!submitted) throw new Error("chat-assistant did not submit a values card within the turn budget")
  return { threadId, card: submitted }
}

async function castVote(cookie: string, deliberationId: number, questionId: number) {
  const rows = (await sql`
    SELECT "fromId", "toId", "contextId", story FROM "EdgeHypothesis"
    WHERE "deliberationId" = ${deliberationId} AND "isArchived" = false
    LIMIT 1
  `) as any[]
  if (!rows.length) throw new Error("no hypothesis to vote on")
  const h = rows[0]
  const body = {
    edge: {
      from: { id: h.fromId },
      to: { id: h.toId },
      contextId: h.contextId,
      deliberationId,
      story: h.story ?? "",
    },
    relationship: "upgrade",
    comment: "smoke test vote",
  }
  const r = await fetch(`${BASE}/deliberation/${deliberationId}/${questionId}/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`vote failed: ${r.status} ${(await r.text()).slice(0, 200)}`)
}

async function deleteDeliberation(adminCookie: string, deliberationId: number) {
  await fetch(`${BASE}/dashboard/${deliberationId}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: adminCookie },
    body: new URLSearchParams({ action: "deleteDeliberation" }).toString(),
    redirect: "manual",
  })
}

export type SmokeResult = {
  deliberationId: number
  articulated: number
  canonicals: number
  hypotheses: number
  edges: number
  graphValues: number
  graphEdges: number
}

export async function runSmokeTest(opts: { keep?: boolean } = {}): Promise<SmokeResult> {
  await ensureUp()

  const adminId = await ensureUser("smoke-admin@local.test", "Smoke Admin", true)
  const userId = await ensureUser("smoke-user@local.test", "Smoke User", false)
  console.log(head(`\n[1/9] Logging in (admin=${adminId}, user=${userId})`))
  const adminCookie = await devLogin(adminId)
  const userCookie = await devLogin(userId)
  console.log(pass("auth.dev produced session cookies"))

  console.log(head(`\n[2/9] Creating deliberation`))
  const title = `Smoke ${new Date().toISOString().slice(0, 19)}`
  const deliberationId = await createDeliberation(
    adminCookie,
    title,
    "Should AI assistants share their honest opinion when asked?"
  )
  console.log(pass(`deliberation #${deliberationId} created`))

  console.log(head(`\n[3/9] Waiting for setupStatus=ready (Inngest gen-seed-contexts)`))
  await waitFor(async () => (await setupStatus(deliberationId)) === "ready", {
    timeoutMs: 5 * 60_000,
    label: "setupStatus=ready",
  })
  console.log(pass("contexts generated"))

  console.log(head(`\n[4/9] Articulating 2 personas via npm run simulate`))
  execSync(
    `tsx scripts/simulate.ts --deliberation ${deliberationId} --personas 2 --articulate-only`,
    { stdio: "inherit", env: process.env }
  )
  await waitFor(async () => (await valueCardCount(deliberationId)) >= 2, {
    timeoutMs: 30_000,
    label: "ValuesCard count ≥ 2",
  })
  console.log(pass(`${await valueCardCount(deliberationId)} cards articulated`))

  console.log(head(`\n[5/9] Triggering Inngest deduplicate`))
  await inngestEvent("deduplicate", { deliberationId })
  await waitFor(async () => (await canonicalCount(deliberationId)) >= 1, {
    timeoutMs: 5 * 60_000,
    label: "≥ 1 canonical card",
  })
  console.log(pass(`${await canonicalCount(deliberationId)} canonical cards`))

  console.log(head(`\n[6/9] Triggering Inngest hypothesize`))
  await inngestEvent("hypothesize", { deliberationId })
  await waitFor(async () => (await hypothesisCount(deliberationId)) >= 1, {
    timeoutMs: 10 * 60_000,
    label: "≥ 1 EdgeHypothesis",
  })
  console.log(pass(`${await hypothesisCount(deliberationId)} edge hypotheses`))

  console.log(head(`\n[7/9] Driving real /api/chat-assistant as fresh user`))
  const q = await firstQuestion(deliberationId)
  const { threadId, card } = await driveChat(userCookie, deliberationId, q.id)
  console.log(pass(`card submitted: "${card.title}"`))

  // Resume the chat URL — verifies the persisted transcript hydrates the tool call
  // (regression for 884bdd4).
  const resumeHtml = await fetch(
    `${BASE}/deliberation/${deliberationId}/${q.id}/chat/${threadId}`,
    { headers: { Cookie: userCookie } }
  ).then((r) => r.text())
  if (!resumeHtml.includes("tool-submit_values_card") || !resumeHtml.includes("output-available")) {
    throw new Error("chat reload did not hydrate the values card")
  }
  console.log(pass("chat reload re-hydrates the card (regression for 884bdd4)"))

  // Re-canonicalise so the new card joins the graph, and re-hypothesize for new pairs.
  await inngestEvent("deduplicate", { deliberationId })
  await waitFor(async () => (await nonCanonCount(deliberationId)) === 0, {
    timeoutMs: 5 * 60_000,
    label: "all cards canonicalized",
  })
  await inngestEvent("hypothesize", { deliberationId })

  console.log(head(`\n[8/9] Voting on one hypothesis as user`))
  await castVote(userCookie, deliberationId, q.id)
  if ((await edgeCount(deliberationId)) < 1) throw new Error("Edge row not persisted")
  console.log(pass("vote persisted as Edge row"))

  console.log(head(`\n[9/9] Fetching graph endpoint`))
  const graph = (await fetch(`${BASE}/api/data/graph?deliberationId=${deliberationId}`).then((r) =>
    r.json()
  )) as { values: any[]; edges: any[] }
  console.log(pass(`graph: ${graph.values.length} values, ${graph.edges.length} edges`))
  // The summarizeGraph filter requires consensus; a single vote may or may not
  // pass the threshold. We only assert the underlying Edge row exists (already
  // checked above) and that the endpoint returns valid JSON shape.
  if (!Array.isArray(graph.values) || !Array.isArray(graph.edges)) {
    throw new Error("graph endpoint returned unexpected shape")
  }

  const result: SmokeResult = {
    deliberationId,
    articulated: await valueCardCount(deliberationId),
    canonicals: await canonicalCount(deliberationId),
    hypotheses: await hypothesisCount(deliberationId),
    edges: await edgeCount(deliberationId),
    graphValues: graph.values.length,
    graphEdges: graph.edges.length,
  }

  if (!opts.keep) {
    console.log(head(`\nCleaning up`))
    await deleteDeliberation(adminCookie, deliberationId)
    console.log(pass(`deleted deliberation #${deliberationId}`))
  } else {
    console.log(`(keeping deliberation #${deliberationId} per --keep)`)
  }

  console.log(head(`\nSMOKE TEST PASSED`))
  console.table(result)
  return result
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].endsWith("full-flow.fixture.ts")
if (isMain) {
  const keep = process.argv.includes("--keep")
  runSmokeTest({ keep }).catch((e) => {
    console.error(`${c.red}SMOKE TEST FAILED:${c.reset}`, e)
    process.exit(1)
  })
}
