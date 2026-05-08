import { LoaderFunctionArgs, redirect } from "@remix-run/node"
import { ensureLoggedIn } from "~/config.server"

export async function loader({ request, params }: LoaderFunctionArgs) {
  await ensureLoggedIn(request)
  const { deliberationId, questionId } = params
  // Generate an opaque chat ID. We used to call openai.beta.threads.create()
  // here; ai@6 + the streamText path has no concept of OpenAI threads. The
  // ID becomes Chat.id in our DB once the user submits a values card.
  const threadId = crypto.randomUUID()
  return redirect(`/deliberation/${deliberationId}/${questionId}/chat/${threadId}`)
}
