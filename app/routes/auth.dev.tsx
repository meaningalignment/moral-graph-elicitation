import { ActionFunctionArgs, LoaderFunctionArgs, redirect } from "@remix-run/node"
import { Form, useSearchParams } from "@remix-run/react"
import { auth, db } from "~/config.server"

// Dev-only login. Posts a SESSION_SECRET; if it matches, sets session.userId
// to the requested userId (default 1) so we can manually test routes that
// require auth without going through the email-code flow.
//
// Disabled when NODE_ENV=production. Hard-fail rather than silently no-op so
// it can never accidentally ship as a backdoor.
function assertDev() {
  if (process.env.NODE_ENV === "production") {
    throw new Response("Not Found", { status: 404 })
  }
}

export async function loader(_args: LoaderFunctionArgs) {
  assertDev()
  return null
}

export async function action({ request }: ActionFunctionArgs) {
  assertDev()
  const form = await request.formData()
  const provided = String(form.get("secret") ?? "")
  const userId = Number(form.get("userId") ?? 1)
  const redirectTo = String(form.get("redirect") ?? "/")

  const expected = process.env.SESSION_SECRET
  if (!expected) throw new Response("SESSION_SECRET not set", { status: 500 })
  if (provided !== expected) {
    throw new Response("Bad secret", { status: 401 })
  }

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) throw new Response(`No user with id=${userId}`, { status: 404 })

  const session = await auth.storage.getSession()
  session.set("userId", user.id)
  session.set("email", user.email)
  session.set("roles", [...(user.role ?? [])])

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await auth.storage.commitSession(session),
    },
  })
}

export default function DevLogin() {
  const [params] = useSearchParams()
  const redirectTo = params.get("redirect") ?? "/"
  return (
    <div className="grid h-screen place-items-center p-8">
      <Form method="post" className="flex flex-col gap-3 w-80">
        <h1 className="text-xl font-semibold">Dev login</h1>
        <p className="text-sm text-muted-foreground">
          Logs you in as the given user id. Disabled in production.
        </p>
        <input type="hidden" name="redirect" value={redirectTo} />
        <label className="text-sm">
          User id
          <input
            name="userId"
            defaultValue={1}
            className="block w-full border rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Session secret
          <input
            name="secret"
            type="password"
            className="block w-full border rounded px-2 py-1 text-sm"
          />
        </label>
        <button
          type="submit"
          className="bg-black text-white rounded px-3 py-2 text-sm"
        >
          Log in
        </button>
      </Form>
    </div>
  )
}
