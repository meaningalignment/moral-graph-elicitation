import * as React from "react"
import Textarea from "react-textarea-autosize"
import type { UseChatHelpers } from "ai/react"
import { Button } from "~/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { IconArrowElbow, IconArrowRight } from "~/components/ui/icons"
import { useEnterSubmit } from "~/hooks/use-enter-submit"
import { Link, useParams } from "@remix-run/react"
import LoadingButton from "~/components/loading-button"

export interface PromptProps
  extends Pick<UseChatHelpers, "input" | "setInput"> {
  onSubmit: (value: string) => Promise<void>
  isLoading: boolean
  isFinished?: boolean
}

const FinishedView = () => {
  const { deliberationId, questionId } = useParams()

  const continueUrl = `/deliberation/${deliberationId}/${questionId}/link-explainer`

  return (
    <div className="flex flex-col items-center justify-center">
      <p className="p-2 pb-4 text-sm text-muted-foreground">
        Thank you for sharing your story!
      </p>
      <div className="flex justify-center pt-2">
        <LoadingButton
          isLoadingOnPageNavigation
          iconRight={<IconArrowRight className="ml-2" />}
        >
          <Link
            to={continueUrl}
            prefetch="render"
            className="flex flex-row items-center justify-center"
          >
            Continue
          </Link>
        </LoadingButton>
      </div>
    </div>
  )
}

export function PromptForm({
  onSubmit,
  input,
  setInput,
  isLoading,
  isFinished,
}: PromptProps) {
  const { formRef, onKeyDown } = useEnterSubmit()
  const inputRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (isLoading || !input?.trim()) {
          return
        }
        setInput("")
        await onSubmit(input)
      }}
      ref={formRef}
    >
      {(isFinished && <FinishedView />) || (
        <div
          className={`relative flex max-h-60 w-full grow flex-col overflow-hidden bg-card pr-8 sm:rounded-md sm:border sm:pr-12`}
        >
          <Textarea
            ref={inputRef}
            tabIndex={0}
            onKeyDown={onKeyDown}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Send a message."
            spellCheck={false}
            className="min-h-[60px] w-full resize-none bg-transparent px-4 py-[1.3rem] focus-within:outline-none sm:text-sm border-none"
          />
          <div className="absolute right-0 h-full flex flex-col items-center justify-center sm:right-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="submit"
                  size="icon"
                  disabled={isLoading || input === ""}
                >
                  <IconArrowElbow />
                  <span className="sr-only">Send message</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Send message</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
    </form>
  )
}
