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
  const id = Number(params.deliberationId)
  // Fetch the deliberation locally instead of leaning on useCurrentDeliberation()
  // (which reads root-loader data). On Vercel the root loader's deliberation
  // value occasionally arrives null even though the URL has a valid id, leaving
  // the page stuck on a skeleton title.
  const [deliberation, carouselValues] = await Promise.all([
    db.deliberation.findFirst({ where: { id } }),
    db.canonicalValuesCard.findMany({
      where: { deliberationId: id, isArchived: false },
      take: 12,
      include: {
        edgesFrom: true,
        valuesCards: {
          select: { chat: { select: { userId: true } } },
        },
        _count: { select: { edgesFrom: true } },
      },
      orderBy: { edgesFrom: { _count: "desc" } },
    }),
  ])

  return json({ deliberation, carouselValues })
}

export default function StartPage() {
  const { deliberationId } = useParams()
  const [isLoading, setIsLoading] = useState(false)
  const { deliberation, carouselValues } = useLoaderData<typeof loader>()

  const title = deliberation?.title ?? "Deliberation"
  const description =
    deliberation?.welcomeText ||
    "Welcome! This process takes around 10-15 minutes."

  return (
    <div className="flex flex-col h-screen w-screen">
      <Header />
      <div className="grid flex-grow place-items-center py-12">
        <div className="flex flex-col items-center mx-auto max-w-2xl text-center px-8">
          <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight mb-6">
            {title}
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
