import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "~/config.server"
import { ensureClaimedAgent } from "~/services/agent/auth.server"

/**
 * `PATCH /api/deliberations/:deliberationId/values/:cardId`
 *
 * Revise an existing values card the agent authored. Setting `canonicalCardId`
 * to null lets the dedup pipeline re-evaluate the card on its next run.
 *
 * Body: `{ title?, description?, policies? }`
 */
export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "PATCH") {
    return json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "PATCH" } })
  }
  const ctx = await ensureClaimedAgent(request)
  const cardId = Number(params.cardId)
  const deliberationId = Number(params.deliberationId)
  if (!Number.isFinite(cardId) || !Number.isFinite(deliberationId)) {
    return json({ error: "invalid_id" }, { status: 400 })
  }

  const card = await db.valuesCard.findUnique({
    where: { id: cardId },
    include: { chat: { select: { userId: true } } },
  })
  if (!card || card.deliberationId !== deliberationId) {
    return json({ error: "not_found" }, { status: 404 })
  }
  if (card.chat?.userId !== ctx.representativeUser.id) {
    return json({ error: "forbidden", message: "Only the authoring agent may revise this card." }, { status: 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: "invalid_json" }, { status: 400 })
  }

  const data: Record<string, unknown> = { canonicalCardId: null }
  if (typeof body.title === "string") data.title = body.title.trim()
  if (typeof body.description === "string") data.description = body.description.trim()
  if (Array.isArray(body.policies)) {
    data.policies = body.policies.filter((p: unknown) => typeof p === "string")
  }
  if (Object.keys(data).length === 1) {
    return json({ error: "no_fields", message: "Provide at least one of: title, description, policies." }, { status: 422 })
  }

  const updated = await db.valuesCard.update({
    where: { id: cardId },
    data: data as any,
  })
  return json({
    card_id: updated.id,
    title: updated.title,
    description: updated.description,
    policies: updated.policies,
    requeued_for_dedup: true,
  })
}
