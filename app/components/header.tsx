import { User } from "@prisma/client"
import { useCurrentDeliberation, useCurrentUser } from "../root"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Form, useParams, useLoaderData } from "@remix-run/react"
import { useRef } from "react"
import { LoaderFunction, json } from "@remix-run/node"
import { db } from "~/config.server"

function UserMenu({ user }: { user: User }) {
  const formRef = useRef(null) as any

  const handleSubmit = () => {
    const ref = formRef.current as any
    ref?.submit()
  }

  return (
    <div className="flex items-center justify-between">
      <Form method="post" action="/auth/logout" ref={formRef}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="pl-0">
              <span className="ml-2">{user?.email}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            sideOffset={8}
            align="start"
            className="w-[200px]"
          >
            <DropdownMenuItem className="flex-col items-start">
              <div className="font-mono text-xs text-muted-foreground">{user?.email}</div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs" onClick={handleSubmit}>
              <button>Sign Out</button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Form>
    </div>
  )
}

export default function Header({
  articulatorConfig,
}: {
  articulatorConfig?: string
}) {
  const user = useCurrentUser()
  const deliberation = useCurrentDeliberation()

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between w-full h-16 px-4 border-b border-border shrink-0 bg-background/70 backdrop-blur-md">
      <div className="flex-grow">
        {deliberation && (
          <h1 className="font-serif text-lg font-semibold tracking-tight">
            {deliberation.title}
          </h1>
        )}
      </div>
      {articulatorConfig && articulatorConfig !== "default" && (
        <p className="font-mono text-xs text-muted-foreground">
          {articulatorConfig}
        </p>
      )}
      <div className="flex items-center justify-end">
        {user && <UserMenu user={user} />}
      </div>
    </header>
  )
}
