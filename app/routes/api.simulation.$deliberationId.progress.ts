import { LoaderFunctionArgs, json } from "@remix-run/node"
import { kv } from "@vercel/kv"
import { auth } from "~/config.server"
import {
  progressKey,
  SimulationProgress,
} from "~/services/simulation"

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await auth.getCurrentUser(request)
  if (!user?.isAdmin) throw new Response("Unauthorized", { status: 401 })
  const deliberationId = Number(params.deliberationId)
  const raw = await kv.get<SimulationProgress | string>(progressKey(deliberationId))
  if (!raw) return json({ progress: null })
  // KV may return either parsed JSON or the raw string depending on how we wrote it.
  const progress = typeof raw === "string" ? JSON.parse(raw) : raw
  return json({ progress })
}
