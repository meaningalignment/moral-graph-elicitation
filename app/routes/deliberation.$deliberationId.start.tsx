import { json, LoaderFunctionArgs } from "@remix-run/node"
import { Button } from "~/components/ui/button"
import { Link, useLoaderData, useParams } from "@remix-run/react"
import Header from "~/components/header"
import Carousel from "~/components/carousel"
import { db } from "~/config.server"
import { useState } from "react"
import { Loader2 } from "lucide-react"
import va from "@vercel/analytics"

export async function loader({ params }: LoaderFunctionArgs) {
  const { deliberationId } = params
  const deliberation = await db.deliberation.findFirst({
    where: { id: Number(deliberationId) },
  })
  const title = deliberation?.title
  const description =
    deliberation?.welcomeText ||
    "Welcome! This process takes around 10-15 minutes."

  const carouselValues = await db.canonicalValuesCard.findMany({
    where: { deliberationId: Number(deliberationId), isArchived: false },
    take: 12,
    include: {
      edgesFrom: true,
      valuesCards: {
        select: {
          chat: {
            select: {
              userId: true,
            },
          },
        },
      },
      _count: {
        select: {
          edgesFrom: true,
        },
      },
    },
    orderBy: {
      edgesFrom: {
        _count: "desc",
      },
    },
  })

  return json({ carouselValues, title, description })
}

export default function StartPage() {
  const { deliberationId } = useParams()
  const [isLoading, setIsLoading] = useState(false)
  const { carouselValues, title, description } = useLoaderData<typeof loader>()

  return (
    <div className="flex flex-col h-screen w-screen">
      <Header />
      <div className="grid flex-grow place-items-center py-12">
        <div className="flex flex-col items-center mx-auto max-w-2xl text-center px-8">
          <h1 className="text-3xl font-bold mb-8">{title}</h1>
          <p className="text-sm text-neutral-500 mb-8">{description}</p>
          <Link
            prefetch="render"
            to={`/deliberation/${deliberationId}/question`}
          >
            <Button
              disabled={isLoading}
              onClick={() => {
                setIsLoading(true)
                va.track("Started Flow")
              }}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Let's Go
            </Button>
          </Link>
        </div>

        <div className="overflow-x-hidden w-screen h-full flex justify-center pt-12">
          <Carousel cards={carouselValues as any[]} />
        </div>
      </div>
    </div>
  )
}
