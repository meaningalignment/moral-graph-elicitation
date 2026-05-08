import { json, LoaderFunctionArgs } from "@remix-run/node"
import { Button } from "~/components/ui/button"
import { Link, useLoaderData, useParams } from "@remix-run/react"
import Header from "~/components/header"
import Carousel from "~/components/carousel"
import { db } from "~/config.server"
import { useState } from "react"
import { Loader2 } from "lucide-react"
import va from "@vercel/analytics"
import { Skeleton } from "~/components/ui/skeleton"
import { useCurrentDeliberation } from "~/root"

export async function loader({ params }: LoaderFunctionArgs) {
  const { deliberationId } = params
  // Awaited directly — defer() doesn't stream on Vercel's Node runtime, so the
  // page would 500 with the deferred chunk never arriving. The query is small
  // (take: 12) and fast.
  const carouselValues = await db.canonicalValuesCard.findMany({
    where: { deliberationId: Number(deliberationId), isArchived: false },
    take: 12,
    include: {
      edgesFrom: true,
      valuesCards: {
        select: { chat: { select: { userId: true } } },
      },
      _count: { select: { edgesFrom: true } },
    },
    orderBy: { edgesFrom: { _count: "desc" } },
  })

  return json({ carouselValues })
}

export default function StartPage() {
  const { deliberationId } = useParams()
  const deliberation = useCurrentDeliberation()
  const [isLoading, setIsLoading] = useState(false)
  const { carouselValues } = useLoaderData<typeof loader>()

  const title = deliberation?.title
  const description =
    deliberation?.welcomeText ||
    "Welcome! This process takes around 10-15 minutes."

  return (
    <div className="flex flex-col h-screen w-screen">
      <Header />
      <div className="grid flex-grow place-items-center py-12">
        <div className="flex flex-col items-center mx-auto max-w-2xl text-center px-8">
          <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight mb-6">
            {title ?? <Skeleton className="h-10 w-72" />}
          </h1>
          <p className="text-base text-muted-foreground mb-10 leading-relaxed">
            {description}
          </p>
          <Link
            prefetch="render"
            to={`/deliberation/${deliberationId}/question`}
          >
            <Button
              size="lg"
              disabled={isLoading}
              onClick={() => {
                setIsLoading(true)
                va.track("Started Flow")
              }}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Begin
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
