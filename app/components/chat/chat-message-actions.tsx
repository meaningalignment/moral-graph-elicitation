import { type UIMessage } from "ai"

import { Button } from "~/components/ui/button"
import { IconCheck, IconCopy } from "~/components/ui/icons"
import { CrossCircledIcon } from "@radix-ui/react-icons"
import { useCopyToClipboard } from "~/hooks/use-copy-to-clipboard"
import { cn } from "~/lib/utils"

interface ChatMessageActionsProps extends React.ComponentProps<"div"> {
  message: UIMessage
  text: string
  onDelete?: (message: UIMessage) => void
}

export function ChatMessageActions({
  message,
  text,
  className,
  ...props
}: ChatMessageActionsProps) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 })

  const onCopy = () => {
    if (isCopied) return
    copyToClipboard(text)
  }

  const onDelete = () => {
    props.onDelete?.(message)
  }

  return (
    <div
      className={cn(
        "flex items-center justify-end transition-opacity group-hover:opacity-100 md:absolute md:-right-10 md:-top-2 md:opacity-0",
        className
      )}
      {...props}
    >
      <Button variant="ghost" size="icon" onClick={onCopy}>
        {isCopied ? <IconCheck /> : <IconCopy />}
        <span className="sr-only">Copy message</span>
      </Button>

      {props.onDelete && (
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <CrossCircledIcon />
          <span className="sr-only">Delete Message</span>
        </Button>
      )}
    </div>
  )
}
