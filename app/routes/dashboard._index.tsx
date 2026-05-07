import { json, LoaderFunctionArgs, redirect } from "@remix-run/node"
import { useLoaderData, Link } from "@remix-run/react"
import { Button } from "~/components/ui/button"
import { auth, db } from "~/config.server"

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await auth.getUserId(request)
  const deliberation = await db.deliberation.findFirst({
    where: { createdBy: userId },
  })

  if (deliberation) {
    return redirect(`/dashboard/${deliberation.id}`)
  }

  return json({ hasDeliberations: false })
}

export default function DeliberationsIndex() {
  const { hasDeliberations } = useLoaderData<typeof loader>()

  if (hasDeliberations) {
    return null // This shouldn't render, as we're redirecting
  }

  return (
    <div className="container mx-auto flex flex-col items-center justify-center h-screen space-y-6">
      <h1 className="font-serif text-4xl font-semibold tracking-tight text-center">
        Welcome
      </h1>
      <p className="text-center text-muted-foreground text-base leading-relaxed">
        To get started, create a new deliberation.
      </p>
      <Button asChild>
        <Link prefetch="render" to="/dashboard/new">
          New Deliberation
        </Link>
      </Button>
    </div>
  )
}
