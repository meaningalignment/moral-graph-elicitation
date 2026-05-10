import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "~/config.server"
import { ensureClaimedAgent } from "~/services/agent/auth.server"
import { createDeliberation } from "~/services/deliberations.server"

/**
 * `GET  /api/deliberations?joined=all|true|false&limit=20&offset=0`
 * `POST /api/deliberations`
 *
 * GET lists deliberations visible to the agent. The `joined` flag is computed
 * against the agent's representative user (any chat or edge attributed to
 * them counts as joined).
 *
 * POST creates a new deliberation. Gated to admins by default; set
 * `AGENT_DELIBERATION_CREATION=open` to allow any claimed agent.
 * Body: `{ title, welcome_text?, questions: string[], num_contexts? }`.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const ctx = await ensureClaimedAgent(request)
  const url = new URL(request.url)
  const joinedParam = url.searchParams.get("joined") ?? "all"
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 100)
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0)

  const repId = ctx.representativeUser.id

  const [chats, edges] = await Promise.all([
    db.chat.findMany({ where: { userId: repId }, select: { deliberationId: true } }),
    db.edge.findMany({ where: { userId: repId }, select: { deliberationId: true } }),
  ])
  const joinedIds = new Set<number>([
    ...chats.map((c) => c.deliberationId),
    ...edges.map((e) => e.deliberationId),
  ])

  const where: Record<string, unknown> = { setupStatus: "ready" }
  if (joinedParam === "true") where.id = { in: [...joinedIds] }
  else if (joinedParam === "false") where.id = { notIn: [...joinedIds] }

  const deliberations = await db.deliberation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    select: {
      id: true,
      title: true,
      topic: true,
      welcomeText: true,
      setupStatus: true,
      createdAt: true,
      _count: { select: { questions: true, chats: true } },
    },
  })

  return json({
    deliberations: deliberations.map((d) => ({
      id: d.id,
      title: d.title,
      topic: d.topic,
      welcome_text: d.welcomeText,
      setup_status: d.setupStatus,
      num_questions: d._count.questions,
      num_participants_approx: d._count.chats,
      created_at: d.createdAt.toISOString(),
      joined: joinedIds.has(d.id),
    })),
    limit,
    offset,
  })
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } })
  }
  const ctx = await ensureClaimedAgent(request)
  const isAdmin = ctx.humanUser?.isAdmin === true
  const isOpen = process.env.AGENT_DELIBERATION_CREATION === "open"
  if (!isAdmin && !isOpen) {
    return json(
      {
        error: "forbidden",
        message:
          "Deliberation creation is restricted to admins. Set AGENT_DELIBERATION_CREATION=open to allow agents.",
      },
      { status: 403 }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: "invalid_json" }, { status: 400 })
  }

  const title = typeof body.title === "string" ? body.title : ""
  const welcomeText = typeof body.welcome_text === "string" ? body.welcome_text : null
  const numContexts = Number.isFinite(Number(body.num_contexts))
    ? Number(body.num_contexts)
    : 5
  const questions: string[] = Array.isArray(body.questions)
    ? body.questions.filter((q: unknown) => typeof q === "string")
    : []

  try {
    const { deliberation } = await createDeliberation({
      creatorId: ctx.humanUser?.id ?? ctx.representativeUser.id,
      title,
      welcomeText,
      questions,
      numContexts,
    })
    return json(
      {
        deliberation_id: deliberation.id,
        title: deliberation.title,
        topic: deliberation.topic,
        setup_status: deliberation.setupStatus,
      },
      { status: 201 }
    )
  } catch (e) {
    return json(
      { error: "create_failed", message: (e as Error).message },
      { status: 422 }
    )
  }
}
