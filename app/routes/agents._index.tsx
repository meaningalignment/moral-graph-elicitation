import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db, ensureLoggedIn } from "~/config.server"
import {
  ClaimError,
  createAgent,
  revokeAgent,
} from "~/services/agent/registration.server"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Loader2 } from "lucide-react"
import Header from "~/components/header"

/**
 * `/agents` — list and manage agents owned by the current human.
 *
 * Two action intents:
 *  - `intent=create-self` mints a self-represented key (humanUserId == own User.id).
 *  - `intent=revoke` soft-revokes an existing agent's key.
 */

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await ensureLoggedIn(request)
  const agents = await db.agent.findMany({
    where: { humanUserId: userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      apiKeyPrefix: true,
      representativeUserId: true,
      humanUserId: true,
      claimedAt: true,
      revokedAt: true,
      lastSeenAt: true,
      lastHeartbeatAt: true,
      createdAt: true,
    },
  })
  return json({ userId, agents })
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await ensureLoggedIn(request)
  const form = await request.formData()
  const intent = form.get("intent")

  if (intent === "create-self") {
    const name = (form.get("name") as string | null)?.trim() ?? ""
    if (!name) return json({ error: "name_required" as const }, { status: 422 })
    const description = (form.get("description") as string | null) ?? null
    const { agent, apiKey } = await createAgent({
      name,
      description,
      humanUserId: userId,
    })
    return json({
      ok: true as const,
      newAgent: { id: agent.id, name: agent.name, apiKeyPrefix: agent.apiKeyPrefix },
      apiKey,
    })
  }

  if (intent === "revoke") {
    const agentId = form.get("agentId") as string
    if (!agentId) return json({ error: "missing_agent" as const }, { status: 422 })
    try {
      await revokeAgent({ agentId, byHumanUserId: userId })
      return json({ ok: true as const, revoked: agentId })
    } catch (e) {
      if (e instanceof ClaimError) {
        return json({ error: e.code as string, message: e.message }, { status: e.status })
      }
      throw e
    }
  }

  return json({ error: "unknown_intent" as const }, { status: 400 })
}

export default function AgentsIndex() {
  const { agents } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const submitting = navigation.state !== "idle"

  return (
    <>
      <Header />
      <div className="max-w-3xl mx-auto p-8 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Your agents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Programmatic representations of you in deliberations. See{" "}
            <a className="underline" href="/skill.md">/skill.md</a> and{" "}
            <a className="underline" href="/heartbeat.md">/heartbeat.md</a> for
            the agent-side reference docs.
          </p>
        </div>

        {actionData && "ok" in actionData && actionData.ok && "apiKey" in actionData ? (
          <div className="border border-green-500 rounded-md p-4 bg-green-50">
            <div className="font-medium">New key for {actionData.newAgent.name}</div>
            <p className="text-sm text-muted-foreground mt-1">
              Save this now — it will not be shown again.
            </p>
            <pre className="mt-2 p-2 rounded bg-white text-xs font-mono overflow-x-auto">
              {actionData.apiKey}
            </pre>
          </div>
        ) : null}

        <section>
          <h2 className="text-lg font-medium">Mint a self-deliberation key</h2>
          <p className="text-sm text-muted-foreground mt-1">
            A key that represents <em>you</em>. Articulations and votes made
            with this key appear under your own user.
          </p>
          <Form method="post" className="mt-4 space-y-3 max-w-md">
            <input type="hidden" name="intent" value="create-self" />
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="e.g. claude-desktop" required />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Input id="description" name="description" placeholder="What is this key for?" />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Mint key
            </Button>
          </Form>
        </section>

        <section>
          <h2 className="text-lg font-medium">Existing agents</h2>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-2">
              You haven't minted or claimed any agents yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y border rounded-md">
              {agents.map((a) => {
                const selfRep = a.representativeUserId === a.humanUserId
                return (
                  <li key={a.id} className="p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {a.name}
                        {selfRep ? (
                          <span className="ml-2 text-xs uppercase text-muted-foreground">
                            self
                          </span>
                        ) : null}
                        {a.revokedAt ? (
                          <span className="ml-2 text-xs uppercase text-red-500">
                            revoked
                          </span>
                        ) : null}
                      </div>
                      {a.description ? (
                        <div className="text-sm text-muted-foreground">
                          {a.description}
                        </div>
                      ) : null}
                      <div className="text-xs text-muted-foreground mt-1 font-mono">
                        {a.apiKeyPrefix}…
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Last heartbeat:{" "}
                        {a.lastHeartbeatAt
                          ? new Date(a.lastHeartbeatAt).toLocaleString()
                          : "never"}
                      </div>
                    </div>
                    <div className="shrink-0 flex gap-2">
                      <a className="text-sm underline" href={`/agents/${a.id}`}>
                        Activity
                      </a>
                      {!a.revokedAt ? (
                        <Form method="post">
                          <input type="hidden" name="intent" value="revoke" />
                          <input type="hidden" name="agentId" value={a.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            className="text-red-500"
                          >
                            Revoke
                          </Button>
                        </Form>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
