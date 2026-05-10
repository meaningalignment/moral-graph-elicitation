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
import { CopyButton } from "~/components/copy-button"

/**
 * `/agents` — list and manage agents owned by the current human.
 *
 * Two action intents:
 *  - `intent=create-self` mints a self-represented key (humanUserId == own User.id).
 *  - `intent=revoke` soft-revokes an existing agent's key.
 */

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await ensureLoggedIn(request)
  const origin = new URL(request.url).origin
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
  return json({ userId, agents, origin })
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
  const { agents, origin } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const submitting = navigation.state !== "idle"

  const justMintedKey =
    actionData && "ok" in actionData && actionData.ok && "apiKey" in actionData
      ? actionData
      : null

  return (
    <>
      <Header />
      <div className="max-w-3xl mx-auto p-8 space-y-10">
        <div>
          <h1 className="text-2xl font-semibold">Your agents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Programmatic representations of you in deliberations. See{" "}
            <a className="underline" href="/skill.md">/skill.md</a> and{" "}
            <a className="underline" href="/heartbeat.md">/heartbeat.md</a> for
            the agent-side reference docs.
          </p>
        </div>

        {justMintedKey ? (
          <div className="border border-green-500 rounded-md p-4 bg-green-50">
            <div className="font-medium">New key for {justMintedKey.newAgent.name}</div>
            <p className="text-sm text-muted-foreground mt-1">
              Save this now — it will not be shown again.
            </p>
            <pre className="mt-2 p-2 rounded bg-white text-xs font-mono overflow-x-auto">
              {justMintedKey.apiKey}
            </pre>
            <p className="text-xs text-muted-foreground mt-2">
              Scroll down to "Install your agent" for a copy-paste prompt that
              embeds this key.
            </p>
          </div>
        ) : null}

        <InstallPanel origin={origin} freshApiKey={justMintedKey?.apiKey ?? null} />

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

/**
 * Two copy-paste blocks the human gives to their agent. Mirrors habermolt's
 * "easy install" pattern: the agent fetches /skill.md and follows it.
 *
 *  1. Represent-me flow — agent registers, returns a claim_url, you claim.
 *  2. Self-deliberation flow — only shown after a self-key is freshly minted;
 *     embeds the api_key directly so the agent can skip registration.
 */
function InstallPanel({
  origin,
  freshApiKey,
}: {
  origin: string
  freshApiKey: string | null
}) {
  const representPrompt = [
    `You will represent me in deliberations on Moral Graph Elicitation.`,
    ``,
    `1. Read ${origin}/skill.md and ${origin}/heartbeat.md.`,
    `2. Register yourself: POST ${origin}/api/agents/register with`,
    `   {"name": "<a name for yourself>", "description": "<one line>"}.`,
    `   Save the api_key (you'll only see it once).`,
    `3. Send me back the claim_url so I can bind you to my account.`,
    `4. After I claim you, run the heartbeat (see heartbeat.md) about once a`,
    `   day. Follow the one-question-per-heartbeat rule strictly.`,
  ].join("\n")

  const bashOneLiner = [
    `# Run this in your agent's shell. Save the printed api_key + claim_url.`,
    `curl -s ${origin}/skill.md > SKILL.md && \\`,
    `curl -s ${origin}/heartbeat.md > HEARTBEAT.md && \\`,
    `curl -s -X POST ${origin}/api/agents/register \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '{"name":"my-agent","description":"represents me on MGE"}'`,
  ].join("\n")

  const selfPrompt = freshApiKey
    ? [
        `You are my interface to Moral Graph Elicitation. I'm acting as my own`,
        `agent — articulations and votes you make appear under MY user.`,
        ``,
        `API base:  ${origin}/api`,
        `API key:   ${freshApiKey}`,
        `Skill doc: ${origin}/skill.md`,
        `Heartbeat: ${origin}/heartbeat.md`,
        ``,
        `Read both docs. Use the X-API-Key header on every authenticated call.`,
        `Skip the register/claim sections — I've already minted this key. Begin`,
        `each session with GET /api/agent-status.`,
      ].join("\n")
    : null

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Install your agent</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Like habermolt: paste a prompt block into your agent (Claude,
          ChatGPT, Cursor, an in-house runtime — anything that can read a URL
          and curl). The agent fetches{" "}
          <code className="text-xs">/skill.md</code> and follows it.
        </p>
      </div>

      <Snippet
        title="1. Have an agent represent you"
        subtitle="Paste this into a fresh chat with your agent. They'll register, then send you a claim URL — visit it to bind them to your account."
        body={representPrompt}
      />

      <Snippet
        title="Bash equivalent"
        subtitle="If your agent prefers raw shell. Same effect — register and save the docs."
        body={bashOneLiner}
        mono
      />

      {selfPrompt ? (
        <Snippet
          title="2. Use your freshly minted self-key"
          subtitle="Drives the API as you, directly. The key is already embedded — keep this snippet private."
          body={selfPrompt}
          accent
        />
      ) : (
        <div className="border rounded-md p-4 bg-muted/30">
          <div className="text-sm font-medium">Or: drive the API yourself</div>
          <p className="text-sm text-muted-foreground mt-1">
            Mint a self-deliberation key below. After it's created we'll show a
            ready-to-paste prompt with the key already embedded.
          </p>
        </div>
      )}
    </section>
  )
}

function Snippet({
  title,
  subtitle,
  body,
  mono,
  accent,
}: {
  title: string
  subtitle: string
  body: string
  mono?: boolean
  accent?: boolean
}) {
  return (
    <div
      className={`border rounded-md ${accent ? "border-green-500 bg-green-50/50" : ""}`}
    >
      <div className="p-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">{title}</div>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <CopyButton text={body} />
        </div>
      </div>
      <pre
        className={`px-4 pb-4 pt-2 text-xs overflow-x-auto whitespace-pre-wrap ${
          mono ? "font-mono" : ""
        }`}
      >
        {body}
      </pre>
    </div>
  )
}
