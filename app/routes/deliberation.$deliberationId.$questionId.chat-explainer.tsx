import Header from "~/components/header"
import { Link, useParams } from "@remix-run/react"
import { useState } from "react"
import StaticChatMessage from "~/components/chat/static-chat-message"
import { cn } from "~/lib/utils"
import LoadingButton from "~/components/loading-button"

export default function ChatExplainerScreen() {
  const { deliberationId, questionId } = useParams()
  const [showNext, setShowNext] = useState(false)

  return (
    <div className="flex flex-col min-h-screen w-full overflow-x-hidden">
      <Header />
      <div className="flex flex-col items-center space-y-8 py-8 sm:py-12 mx-4 sm:mx-8">
        <StaticChatMessage
          onFinished={() => {
            setShowNext(true)
          }}
          isFinished={showNext}
          text={`This process has 2 steps.\n\nIn the first step, you will articulate a value for for the question you chose. This usually takes around 5-10 minutes.\n\nNote: Only the values you articulate will be shared, not the chat content.`}
        />
        <div
          className={cn(
            "transition-opacity ease-in duration-500",
            showNext ? "opacity-100" : "opacity-0",
            `delay-${75}`
          )}
        >
          <div className="flex flex-row mx-auto justify-center items-center space-x-2 pt-8">
            <LoadingButton>
              <Link
                to={`/deliberation/${deliberationId}/${questionId}/chat`}
                prefetch="render"
                className="flex flex-row items-center justify-center"
              >
                Continue
              </Link>
            </LoadingButton>
          </div>
        </div>
      </div>
    </div>
  )
}
