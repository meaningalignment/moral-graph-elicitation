import { Form, useLoaderData } from "@remix-run/react"
import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db, ensureLoggedIn } from "~/config.server"
import Header from "~/components/header"
import { Button } from "~/components/ui/button"

/**
 * `/agents/:agentId` — activity view for an agent owned by the current human.
 *
 * Shows recent chats, articulated values cards, and edge votes attributed to
 * the agent's representative User. Disapproval buttons are wired in Phase 5.
 */

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await ensureLoggedIn(request)
  const agent = await db.agent.findUnique({
    where: { id: params.agentId! },
    include: { representativeUser: true },
  })
  if (!agent) throw new Response("Not found", { status: 404 })
  if (agent.humanUserId !== userId) {
    throw new Response("Forbidden", { status: 403 })
  }

  const repId = agent.representativeUserId
  const [chats, valuesCards, edges, disapprovals] = await Promise.all([
    db.chat.findMany({
      where: { userId: repId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        deliberationId: true,
        questionId: true,
        ValuesCard: { select: { id: true, title: true } },
      },
    }),
    db.valuesCard.findMany({
      where: { chat: { userId: repId } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        deliberationId: true,
        questionId: true,
      },
    }),
    db.edge.findMany({
      where: { userId: repId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        fromId: true,
        toId: true,
        contextId: true,
        type: true,
        comment: true,
        createdAt: true,
        deliberationId: true,
        from: { select: { title: true } },
        to: { select: { title: true } },
      },
    }),
    db.agentDisapproval.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ])

  return json({ agent, chats, valuesCards, edges, disapprovals })
}

export default function AgentDetail() {
  const { agent, chats, valuesCards, edges, disapprovals } =
    useLoaderData<typeof loader>()

  return (
    <>
      <Header />
      <div className="max-w-4xl mx-auto p-8 space-y-8">
        <div>
          <a className="text-sm underline" href="/agents">
            ← all agents
          </a>
          <h1 className="text-2xl font-semibold mt-2">{agent.name}</h1>
          {agent.description ? (
            <p className="text-sm text-muted-foreground">{agent.description}</p>
          ) : null}
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            {agent.apiKeyPrefix}…
          </p>
        </div>

        <Section title={`Articulated values (${valuesCards.length})`}>
          {valuesCards.length === 0 ? (
            <Empty>No articulated cards yet.</Empty>
          ) : (
            <ul className="divide-y border rounded-md">
              {valuesCards.map((c) => (
                <li key={c.id} className="p-3">
                  <div className="font-medium">{c.title}</div>
                  <div className="text-sm text-muted-foreground line-clamp-2">
                    {c.description}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Deliberation {c.deliberationId} · Question {c.questionId}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Recent votes (${edges.length})`}>
          {edges.length === 0 ? (
            <Empty>No votes cast yet.</Empty>
          ) : (
            <ul className="divide-y border rounded-md">
              {edges.map((e) => (
                <li
                  key={`${e.fromId}-${e.toId}-${e.contextId}`}
                  className="p-3 text-sm"
                >
                  <div>
                    <span className="font-medium">{e.from?.title ?? `#${e.fromId}`}</span>{" "}
                    →{" "}
                    <span className="font-medium">{e.to?.title ?? `#${e.toId}`}</span>{" "}
                    <span className="text-xs uppercase ml-1">{e.type}</span>
                  </div>
                  {e.comment ? (
                    <div className="text-muted-foreground mt-1">{e.comment}</div>
                  ) : null}
                  <div className="text-xs text-muted-foreground mt-1">
                    Context: {e.contextId} · Deliberation {e.deliberationId}
                  </div>
                  <Form
                    method="post"
                    action={`/api/agents/${agent.id}/disapprove`}
                    className="mt-2 flex flex-col gap-1"
                  >
                    <input type="hidden" name="actionType" value="vote_on_upgrades" />
                    <input
                      type="hidden"
                      name="targetKey"
                      value={`${e.fromId}:${e.toId}:${e.contextId}`}
                    />
                    <input
                      type="hidden"
                      name="deliberationId"
                      value={e.deliberationId}
                    />
                    <input
                      name="reason"
                      placeholder="Why does this misrepresent you?"
                      className="border px-2 py-1 rounded text-sm"
                    />
                    <Button type="submit" variant="ghost" size="sm" className="self-start text-red-500">
                      Flag this vote
                    </Button>
                  </Form>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Recent chats (${chats.length})`}>
          {chats.length === 0 ? (
            <Empty>No chats yet.</Empty>
          ) : (
            <ul className="divide-y border rounded-md">
              {chats.map((c) => (
                <li key={c.id} className="p-3 text-sm">
                  <div className="font-mono text-xs">{c.id}</div>
                  <div className="text-xs text-muted-foreground">
                    Deliberation {c.deliberationId} · Question {c.questionId}
                    {c.ValuesCard ? ` · submitted "${c.ValuesCard.title}"` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Disapprovals (${disapprovals.length})`}>
          {disapprovals.length === 0 ? (
            <Empty>None.</Empty>
          ) : (
            <ul className="divide-y border rounded-md">
              {disapprovals.map((d) => (
                <li key={d.id} className="p-3 text-sm">
                  <div>
                    <span className="font-medium">{d.actionType}</span>
                    <span className="text-xs uppercase ml-2">{d.status}</span>
                  </div>
                  <div className="text-muted-foreground mt-1">{d.reason}</div>
                  {d.correctionSummary ? (
                    <div className="text-xs text-muted-foreground mt-1">
                      Correction: {d.correctionSummary}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-medium mb-2">{title}</h2>
      {children}
    </section>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}
