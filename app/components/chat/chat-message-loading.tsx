import { cn } from "~/lib/utils"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { IconOpenAI } from "~/components/ui/icons"

type Props = {
  threadId: string
}

export default function ChatMessageLoading({ threadId }: Props) {
  const [currentFunction, setCurrentFunction] = useState<string | null>(null)

  // Poll for the current function call.
  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch(`/api/chat/${threadId}/function`)
      const json = await res.json()

      if (json && json.function) {
        setCurrentFunction(json.function)
      }
    }

    fetchData()

    const interval = setInterval(fetchData, 1000)

    return () => {
      clearInterval(interval)
    }
  }, [])

  return (
    <div className={cn("group relative mb-4 flex items-start md:-ml-12")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md border shadow bg-primary text-primary-foreground"
        )}
      >
        <IconOpenAI />
      </div>
      <div className="ml-4 flex-1 space-y-2 overflow-hidden px-1">
        <div className="flex flex-row align-center">
          {currentFunction ? (
            <div className="bg-card rounded-md px-2 py-1 ml-2 border animate-pulse flex flex-row align-center justify-center gap-1">
              <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{currentFunction}</span>
            </div>
          ) : (
            <Loader2 className="mt-2 h-4 w-4 animate-spin" />
          )}
        </div>
      </div>
    </div>
  )
}
