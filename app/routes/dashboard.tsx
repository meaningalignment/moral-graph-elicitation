import {
  Outlet,
  NavLink,
  useLoaderData,
  redirect,
  useParams,
  useLocation,
  Form,
} from "@remix-run/react"
import type { LoaderFunctionArgs } from "@remix-run/node"
import { auth, db } from "~/config.server"
import { Button } from "~/components/ui/button"
import { ScrollArea } from "~/components/ui/scroll-area"
import { cn } from "~/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { useState } from "react"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await auth.getCurrentUser(request)
  if (!user) return redirect("/auth/login")
  const where = user.isAdmin ? {} : { createdBy: user.id }
  const deliberations = await db.deliberation.findMany({ where })
  const participatingIn = await db.deliberation.findMany({
    where: {
      createdBy: {
        not: user.id,
      },
      OR: [
        {
          edges: {
            some: {
              userId: user.id,
            },
          },
        },
        {
          chats: {
            some: {
              userId: user.id,
            },
          },
        },
      ],
    },
  })
  return { deliberations, participatingIn, user }
}

export default function Deliberations() {
  const { deliberations, participatingIn, user } =
    useLoaderData<typeof loader>()
  const params = useParams()
  const location = useLocation()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const currentDeliberation = [...deliberations, ...participatingIn].find(
    (d) => d.id === Number(params.deliberationId)
  )

  const pathSegments = location.pathname
    .split("/")
    .filter(Boolean)
    .slice(2) // Skip 'deliberations' and deliberationId
    .filter((segment) => isNaN(Number(segment))) // Filter out numeric segments

  return (
    <div className="min-h-screen flex">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        id="sidebar"
        className={cn(
          "fixed left-0 top-0 z-40 h-screen w-64 transition-transform lg:translate-x-0",
          !isSidebarOpen && "-translate-x-full"
        )}
        aria-label="Sidebar"
      >
        <div className="flex h-full flex-col overflow-y-auto border-r border-border bg-card px-3 py-4">
          <div className="mb-8 flex items-center px-3 py-2 text-foreground">
            <svg
              className="h-5 w-5 shrink-0"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
            </svg>
            <span className="ml-3 text-base font-semibold tracking-tight">
              Moral Graph
            </span>
          </div>
          <ScrollArea className="flex-grow">
            <div className="mb-2 px-3 text-xs font-semibold text-muted-foreground ">
              Your Deliberations
            </div>
            <ul className="space-y-2 text-sm font-medium">
              {deliberations.map((delib: any) => (
                <li key={delib.id}>
                  <NavLink
                    prefetch="render"
                    to={`/dashboard/${delib.id}`}
                    className={({ isActive, isPending }) =>
                      cn(
                        "flex items-center rounded-lg px-3 py-2 text-foreground hover:bg-muted  ",
                        isPending && "bg-muted ",
                        isActive && "bg-muted "
                      )
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="ml-3 flex-1 whitespace-nowrap overflow-hidden text-ellipsis">
                      <span className="inline-block max-w-full truncate">
                        {delib.title}
                      </span>
                    </span>
                  </NavLink>
                </li>
              ))}
            </ul>

            {participatingIn.length > 0 && (
              <>
                <div className="mt-6 mb-2 px-3 text-xs font-semibold text-muted-foreground ">
                  Participating In
                </div>
                <ul className="space-y-2 text-sm font-medium">
                  {participatingIn.map((delib: any) => (
                    <li key={delib.id}>
                      <NavLink
                        to={`/dashboard/${delib.id}`}
                        className={({ isActive, isPending }) =>
                          cn(
                            "flex items-center rounded-lg px-3 py-2 text-foreground hover:bg-muted  ",
                            isPending && "bg-muted ",
                            isActive && "bg-muted "
                          )
                        }
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                          <circle cx="9" cy="7" r="4"></circle>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <span className="ml-3 flex-1 whitespace-nowrap overflow-hidden text-ellipsis">
                          <span className="inline-block max-w-full truncate">
                            {delib.title}
                          </span>
                        </span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </ScrollArea>
          <div className="mt-auto space-y-4 pt-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full">
                  <div className="flex items-center justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 mr-2"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span className="truncate">{user.email}</span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <Form action="/auth/logout" method="post">
                  <DropdownMenuItem asChild>
                    <button className="w-full text-left cursor-pointer">
                      Logout
                    </button>
                  </DropdownMenuItem>
                </Form>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" className="w-full">
              <NavLink
                to="/dashboard/new"
                prefetch="intent"
                className="w-full flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                New Deliberation
              </NavLink>
            </Button>
          </div>
        </div>
      </aside>
      <main className="lg:ml-64 flex-1 min-w-0">
        {params.deliberationId && (
          <nav className="sticky top-0 z-10 px-4 sm:px-6 py-3 sm:py-4 flex-none border-b border-border bg-card">
            <div className="flex items-center min-w-0">
              <button
                type="button"
                aria-label="Toggle sidebar"
                className="lg:hidden -ml-2 mr-2 p-2 rounded-md text-muted-foreground hover:bg-muted shrink-0"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  {isSidebarOpen ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  )}
                </svg>
              </button>
              <ol className="flex items-center text-sm min-w-0 overflow-x-auto whitespace-nowrap hide-scrollbar">
                <li className="font-medium text-foreground shrink-0 max-w-[40vw] sm:max-w-none truncate">
                  <NavLink
                    prefetch="render"
                    to={`/dashboard/${params.deliberationId}`}
                    className="hover:text-muted-foreground transition-colors block truncate"
                    title={currentDeliberation?.title}
                  >
                    {currentDeliberation?.title}
                  </NavLink>
                </li>
                {pathSegments.map((segment, index) => (
                  <li key={segment} className="flex items-center shrink-0">
                    <span className="mx-2 text-muted-foreground">/</span>
                    <NavLink
                      prefetch="intent"
                      to={`/dashboard/${params.deliberationId}/${pathSegments
                        .slice(0, index + 1)
                        .join("/")}`}
                      className="font-medium text-muted-foreground capitalize hover:text-foreground transition-colors"
                      title={segment}
                    >
                      {segment.length > 17
                        ? `${segment.slice(0, 17)}...`
                        : segment}
                    </NavLink>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        )}
        <div className="h-full">
          <div className="px-4 sm:px-6 py-4">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}
