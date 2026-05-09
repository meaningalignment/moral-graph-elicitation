import Header from "~/components/header"
import { Link, useNavigate, useParams } from "@remix-run/react"
import { useState } from "react"
import StaticChatMessage from "~/components/chat/static-chat-message"
import { cn } from "~/lib/utils"
import LoadingButton from "~/components/loading-button"

export default function LinkExplainerScreen() {
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
          text={
            "Our values naturally evolve to reflect our experiences throughout life.\n\nWe're about to present you with accounts of individuals who have undergone shifts in their values. Your next task is to evaluate whether you believe each person has become wiser through their journey.\n\nYou'll be engaged with 5 stories.\n\nAre you ready?"
          }
        />
        <div
          className={cn(
            "transition-opacity ease-in duration-500",
            showNext ? "opacity-100" : "opacity-0",
            `delay-${125}`
          )}
        >
          <div className="flex flex-row mx-auto justify-center items-center space-x-2 pt-8">
            <LoadingButton>
              <Link
                to={`/deliberation/${deliberationId}/${questionId}/link`}
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
