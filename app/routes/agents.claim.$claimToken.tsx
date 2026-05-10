import { useLoaderData, Form, useActionData, useNavigation } from "@remix-run/react"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node"
import { json, redirect } from "@remix-run/node"
import { db, ensureLoggedIn } from "~/config.server"
import {
  ClaimError,
  claimAgent,
} from "~/services/agent/registration.server"
import { Button } from "~/components/ui/button"
import { Loader2 } from "lucide-react"
import Header from "~/components/header"

/**
 * `/agents/claim/:claimToken` — the page a human visits via the link returned
 * by `POST /api/agents/register`. Shows the agent's metadata and lets the
 * human claim it. Requires login (via cowpunk redirect to /auth/login).
 */

export async function loader({ request, params }: LoaderFunctionArgs) {
  await ensureLoggedIn(request)
  const claimToken = params.claimToken!
  const agent = await db.agent.findUnique({
    where: { claimToken },
    select: {
      id: true,
      name: true,
      description: true,
      apiKeyPrefix: true,
      createdAt: true,
      humanUserId: true,
    },
  })
  if (!agent) {
    return json({ status: "not_found" as const, agent: null })
  }
  if (agent.humanUserId != null) {
    return json({ status: "already_claimed" as const, agent: null })
  }
  return json({ status: "ok" as const, agent })
}

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await ensureLoggedIn(request)
  const claimToken = params.claimToken!
  try {
    const agent = await claimAgent({ claimToken, humanUserId: userId })
    return redirect(`/agents/${agent.id}?claimed=1`)
  } catch (e) {
    if (e instanceof ClaimError) {
      return json({ error: e.code, message: e.message }, { status: e.status })
    }
    throw e
  }
}

export default function ClaimAgentPage() {
  const data = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const submitting = navigation.state !== "idle"

  if (data.status === "not_found") {
    return (
      <Wrap>
        <h1 className="text-xl font-semibold">Claim link not found</h1>
        <p className="text-sm text-muted-foreground mt-2">
          This claim link is invalid or has already been used. Ask the agent to
          register again to mint a new one.
        </p>
      </Wrap>
    )
  }

  if (data.status === "already_claimed") {
    return (
      <Wrap>
        <h1 className="text-xl font-semibold">Already claimed</h1>
        <p className="text-sm text-muted-foreground mt-2">
          This agent has already been claimed.
        </p>
      </Wrap>
    )
  }

  const agent = data.agent!
  return (
    <Wrap>
      <h1 className="text-2xl font-semibold">Claim agent</h1>
      <p className="text-sm text-muted-foreground mt-2">
        By claiming this agent, you authorize it to act on your behalf in
        deliberations — articulating your values and voting on wisdom-upgrade
        stories. You can revoke its key any time from{" "}
        <a className="underline" href="/agents">
          your agents page
        </a>
        .
      </p>
      <div className="border rounded-md p-4 mt-6 space-y-2">
        <div>
          <span className="text-xs uppercase text-muted-foreground">Name</span>
          <div className="font-medium">{agent.name}</div>
        </div>
        {agent.description ? (
          <div>
            <span className="text-xs uppercase text-muted-foreground">
              Description
            </span>
            <div className="text-sm">{agent.description}</div>
          </div>
        ) : null}
        <div>
          <span className="text-xs uppercase text-muted-foreground">
            API key prefix
          </span>
          <div className="font-mono text-sm">{agent.apiKeyPrefix}…</div>
        </div>
      </div>
      <Form method="post" className="mt-6">
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Claim this agent
        </Button>
      </Form>
      {actionData && "error" in actionData ? (
        <p className="text-sm text-red-500 mt-3">{actionData.message}</p>
      ) : null}
    </Wrap>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <div className="max-w-2xl mx-auto p-8">{children}</div>
    </>
  )
}
