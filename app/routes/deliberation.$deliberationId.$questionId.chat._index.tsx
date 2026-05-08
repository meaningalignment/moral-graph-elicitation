import { LoaderFunctionArgs, redirect } from "@remix-run/node"
import { ensureLoggedIn } from "~/config.server"

export async function loader({ request, params }: LoaderFunctionArgs) {
  await ensureLoggedIn(request)
  const { deliberationId, questionId } = params
  const threadId = crypto.randomUUID()
  return redirect(`/deliberation/${deliberationId}/${questionId}/chat/${threadId}`)
}
