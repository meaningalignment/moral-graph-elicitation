import { Button } from "~/components/ui/button"
import Header from "~/components/header"
import {
  useLoaderData,
  useNavigate,
  useParams,
  useSubmit,
  useNavigation,
} from "@remix-run/react"
import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node"
import { auth, db } from "~/config.server"
import ValuesCard from "~/components/values-card"
import { useEffect, useState } from "react"
import { IconArrowRight } from "~/components/ui/icons"
import { Separator } from "../components/ui/separator"
import { Loader2 } from "lucide-react"
import StaticChatMessage from "~/components/chat/static-chat-message"
import { cn } from "~/lib/utils"
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group"
import { Label } from "~/components/ui/label"
import { Textarea } from "~/components/ui/textarea"
import va from "@vercel/analytics"
import { drawFreceny } from "~/services/hypothesis-selection"

type Relationship = "upgrade" | "no_upgrade" | "not_sure"

export async function loader({ params }: LoaderFunctionArgs) {
  const deliberationId = parseInt(params.deliberationId!)
  const draw = await drawFreceny(deliberationId, 5)
  console.log(draw)
  return json({ draw })
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await auth.getUserId(request)
  const body = await request.json()
  const { edge, comment, relationship } = body

  console.log(
    `Submitting edge from ${edge.from.id} to ${edge.to.id} as ${relationship}`
  )

  await db.edge.upsert({
    where: {
      userId_fromId_toId: {
        userId,
        fromId: edge.from.id,
        toId: edge.to.id,
      },
    },
    create: {
      comment,
      type: relationship,
      story: edge.story,
      user: { connect: { id: userId } },
      to: { connect: { id: edge.to.id } },
      from: { connect: { id: edge.from.id } },
      context: {
        connect: {
          id_deliberationId: {
            id: edge.contextId,
            deliberationId: edge.deliberationId,
          },
        },
      },
      deliberation: { connect: { id: edge.deliberationId } },
    },
    update: {
      comment,
      type: relationship,
      story: edge.story,
    },
  })

  return json({})
}

export default function LinkScreen() {
  const navigate = useNavigate()
  const submit = useSubmit()
  const navigation = useNavigation()

  const { deliberationId } = useParams()

  const [index, setIndex] = useState<number>(0)
  const [showCards, setShowCards] = useState(false)
  const [relationship, setRelationship] = useState<Relationship | null>(null)
  const [comment, setComment] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const { draw } = useLoaderData<typeof loader>()

  // If there are no values in the draw, continue to next step.
  useEffect(() => {
    if (draw.length === 0) {
      navigate(`/deliberation/${deliberationId}/finished`)
    }
  }, [draw])

  const onContinue = async () => {
    setIsLoading(true)
    va.track(`Submitted Edge ${index + 1}`)

    const body = {
      edge: draw[index],
      relationship,
      comment,
    }

    console.log("Submitting edge", body)

    submit(body, { method: "post", encType: "application/json" })

    // If we're at the end of the draw, navigate to the finish screen.
    if (index === draw.length - 1) {
      va.track("Finished")
      return navigate(`/deliberation/${deliberationId}/finished`)
    }

    setRelationship(null)
    setComment(null)
    setIsLoading(false)

    // Move to the next pair.
    setIndex((i) => i + 1)

    // Scroll to the top of the page.
    window.scrollTo(0, 0)
  }

  if (!draw[index]) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen w-screen">
      <Header />
      <div className="grid flex-grow place-items-center space-y-8 py-12 px-8">
        <h1 className="text-muted-foreground mb-2">{`User Story ${index + 1}/${
          draw.length
        }`}</h1>
        <div className="w-full max-w-2xl">
          <h1 className="text-md font-bold mb-2 pl-12 md:pl-0">
            {draw[index].contextId}
          </h1>
          <StaticChatMessage
            onFinished={() => {
              setShowCards(true)
            }}
            isFinished={showCards}
            text={'"' + draw[index].story + '"'}
            role="user"
            fastMode={true}
          />
        </div>
        <div
          className={cn(
            `grid grid-cols-1 mx-auto gap-4 items-center justify-items-center lg:grid-cols-[max-content,min-content,max-content] pt-4`,
            "transition-opacity ease-in duration-500",
            showCards ? "opacity-100" : "opacity-0",
            `delay-${75}`
          )}
        >
          <ValuesCard card={draw[index].from as any} />
          <IconArrowRight className="h-8 w-8 mx-auto rotate-90 lg:rotate-0" />
          <ValuesCard card={draw[index].to as any} />
        </div>
        <div
          className={cn(
            "max-w-2xl pt-8",
            `transition-opacity ease-in duration-500`,
            showCards ? "opacity-100" : "opacity-0",
            `delay-${100}`
          )}
        >
          When{" "}
          <span className="font-bold">
            {draw[index].contextId.charAt(0).toLowerCase() +
              draw[index].contextId.slice(1)}
          </span>
          , this person used to focus on{" "}
          <span className="font-bold">{draw[index].from.title}</span>.<br />
          <br />
          Now they realize{" "}
          <span className="font-bold">{draw[index].to.title}</span> covers
          everything they need, so they only focus on that.
        </div>
        <div
          className={cn(
            `w-full flex items-center justify-center py-8`,
            "transition-opacity ease-in duration-500",
            showCards ? "opacity-100" : "opacity-0",
            `delay-${125}`
          )}
        >
          <Separator className="max-w-2xl" />
        </div>
        <div
          className={cn(
            "transition-opacity ease-in duration-500 flex flex-col items-center justify-center w-full max-w-xs",
            showCards ? "opacity-100" : "opacity-0",
            `delay-${150}`
          )}
        >
          <h1 className="font-bold mr-auto">Did this person become wiser?</h1>
          <RadioGroup
            key={relationship}
            className="w-full"
            value={relationship ?? undefined}
            onValueChange={(r) => setRelationship(r as Relationship)}
          >
            <div className="flex flex-col space-y-2  w-full space-between mt-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value={"upgrade"} id="yes" />
                <Label htmlFor="yes">Yes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no_upgrade" id="no" />
                <Label htmlFor="no">No</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="not_sure" id="not_sure" />
                <Label htmlFor="not_sure">Not Sure</Label>
              </div>
            </div>
          </RadioGroup>

          <div className="grid w-full max-w-sm items-center gap-2 mt-8">
            <Label htmlFor="comment">Why?</Label>
            <Textarea
              id="comment"
              disabled={!relationship}
              className="bg-card"
              onChange={(e) => setComment(e.target.value)}
              value={comment ?? ""}
              placeholder="Add your reasoning"
            />
          </div>

          <div className="mt-8">
            <Button disabled={!relationship || isLoading} onClick={onContinue}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {draw.length - index === 1 ? "Finish" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
