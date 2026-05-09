import { Loader2 } from "lucide-react"
import { type UIMessage } from "ai"
import { Separator } from "~/components/ui/separator"
import { ChatMessage } from "./chat-message"
import ValuesCard, { ValuesCardData } from "~/components/values-card"
import { IconOpenAI } from "~/components/ui/icons"
import { cn } from "~/lib/utils"

export interface ChatList {
  threadId: string
  messages: UIMessage[]
  isLoading: boolean
}

function getValuesCard(message: UIMessage): ValuesCardData | null {
  for (const part of message.parts as any[]) {
    if (
      part.type === "tool-submit_values_card" &&
      (part.state === "input-available" ||
        part.state === "output-available") &&
      part.input
    ) {
      const data = part.input
      return {
        title: data.title,
        description: data.description,
        policies: data.policies ?? [],
      }
    }
  }
  return null
}

function hasRenderableText(message: UIMessage) {
  return (message.parts as any[]).some(
    (p) => p.type === "text" && typeof p.text === "string" && p.text.length > 0
  )
}

export function ChatList({ threadId: _threadId, messages, isLoading }: ChatList) {
  if (!messages.length) {
    return null
  }

  const lastMessage = messages[messages.length - 1]
  const showThinking =
    isLoading && (!lastMessage || lastMessage.role === "user")

  return (
    <div className="relative mx-auto max-w-2xl px-3 sm:px-4">
      {messages.map((message, i) => {
        const card = getValuesCard(message)
        const showText =
          (message.role === "user" || message.role === "assistant") &&
          hasRenderableText(message)
        if (!card && !showText) return null
        const isLast = i === messages.length - 1
        return (
          <div key={message.id ?? i}>
            {showText && <ChatMessage message={message} />}
            {card && (
              <div className="mb-4">
                <ValuesCard detailsInline card={card} />
              </div>
            )}
            {!isLast && <Separator className="my-4 md:my-8" />}
          </div>
        )
      })}
      {showThinking && (
        <>
          <Separator className="my-4 md:my-8" />
          <ThinkingDot />
        </>
      )}
    </div>
  )
}

function ThinkingDot() {
  return (
    <div className={cn("group relative mb-4 flex items-start md:-ml-12")}>
      <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md border shadow bg-primary text-primary-foreground">
        <IconOpenAI />
      </div>
      <div className="ml-4 flex-1 space-y-2 overflow-hidden px-1">
        <Loader2 className="mt-2 h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    </div>
  )
}
