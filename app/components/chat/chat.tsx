import React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { cn } from "~/lib/utils"
import { ChatList } from "./chat-list"
import { ChatPanel } from "./chat-panel"
import { ChatScrollAnchor } from "./chat-scroll-anchor"

export interface ChatProps extends React.ComponentProps<"div"> {
  oldMessages?: UIMessage[]
  threadId: string
  deliberationId: number
  questionId: number
}

export function Chat({
  threadId,
  questionId,
  deliberationId,
  oldMessages,
  className,
}: ChatProps) {
  const { messages, sendMessage, status } = useChat({
    id: threadId,
    transport: new DefaultChatTransport({
      api: "/api/chat-assistant",
      body: { threadId, questionId, deliberationId },
    }),
    messages: oldMessages,
  })

  const hasValuesCard = messages.some((m) =>
    m.parts.some(
      (p: any) =>
        typeof p.type === "string" &&
        p.type === "tool-submit_values_card" &&
        p.state === "output-available"
    )
  )

  const isStreaming = status === "streaming" || status === "submitted"

  return (
    <>
      <div className={cn("pb-[200px] pt-4 md:pt-10", className)}>
        <ChatList
          threadId={threadId}
          messages={messages}
          isLoading={isStreaming}
        />
        <ChatScrollAnchor trackVisibility={isStreaming} />
      </div>
      <ChatPanel
        isLoading={isStreaming}
        isFinished={hasValuesCard}
        onSubmit={async (text) => {
          await sendMessage({ text })
        }}
      />
    </>
  )
}
