import { PromptForm } from "~/components/chat/prompt-form"
import { ButtonScrollToBottom } from "~/components/chat/button-scroll-to-bottom"
import { FooterText } from "~/components/footer"

export interface ChatPanelProps {
  isLoading: boolean
  isFinished?: boolean
  onSubmit: (text: string) => Promise<void> | void
}

export function ChatPanel({ isLoading, isFinished, onSubmit }: ChatPanelProps) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 light:bg-gradient-to-b from-muted/10 from-10% to-muted/30 to-50%"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ButtonScrollToBottom />
      <div className="mx-auto sm:max-w-2xl sm:px-4">
        <div className="flex mb-2 h-6 sm:h-10 items-center justify-center"></div>
        <div className="space-y-4 border-t bg-card px-3 sm:px-4 py-2 shadow-lg sm:rounded-t-xl sm:border pb-4 md:py-4">
          <PromptForm
            onSubmit={onSubmit}
            isLoading={isLoading}
            isFinished={isFinished && !isLoading}
          />
          <FooterText className="hidden sm:block" />
        </div>
      </div>
    </div>
  )
}
