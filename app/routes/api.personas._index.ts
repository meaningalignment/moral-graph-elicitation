import { LoaderFunctionArgs, json } from "@remix-run/node"
import path from "node:path"
import { auth } from "~/config.server"
import { loadPersonas } from "../../simulation/personas/schema"

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await auth.getCurrentUser(request)
  if (!user?.isAdmin) throw new Response("Unauthorized", { status: 401 })
  const personas = loadPersonas(
    path.join(process.cwd(), "simulation", "personas")
  )
  return json({ personas })
}
