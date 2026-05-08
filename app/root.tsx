import { json, SerializeFrom, type LoaderFunctionArgs } from "@remix-run/node"
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "@remix-run/react"
import { auth, db } from "./config.server"
import { Deliberation, User } from "@prisma/client"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import { Toaster } from "sonner"
import { NavigationProgress } from "./components/navigation-progress"

import "./globals.css"

export async function loader({ request, params }: LoaderFunctionArgs) {
  // Runs on every navigation. Keep it tight: two indexed lookups in parallel,
  // no unbounded queries. The previous version pulled every ValuesCard for
  // the user, which got slow as users accumulated chats.
  const userId = await auth.getUserId(request)
  const deliberationId = params.deliberationId
    ? Number(params.deliberationId)
    : undefined

  const [user, deliberation] = await Promise.all([
    userId
      ? (db.user.findUnique({ where: { id: userId } }) as Promise<User | null>)
      : Promise.resolve(null),
    deliberationId
      ? (db.deliberation.findFirst({
          where: { id: deliberationId },
        }) as Promise<Deliberation | null>)
      : Promise.resolve(null),
  ])

  return json({ user, deliberation })
}

export function useCurrentUser(): User | null {
  const { user } = useRouteLoaderData("root") as SerializeFrom<typeof loader>
  return user
}

export function useCurrentDeliberation(): Deliberation | null {
  const { deliberation } = useRouteLoaderData("root") as SerializeFrom<
    typeof loader
  >
  return deliberation as Deliberation | null
}

export default function App() {
  return (
    <TooltipProvider>
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin="anonymous"
          />
          <Meta />
          <Links />
        </head>
        <body>
          <NavigationProgress />
          <Outlet />
          <ScrollRestoration />
          <Scripts />
          <Toaster />
        </body>
      </html>
    </TooltipProvider>
  )
}
