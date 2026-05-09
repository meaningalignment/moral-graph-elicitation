import { LoaderFunctionArgs, json, redirect } from "@remix-run/node"
import Header from "~/components/header"
import { useLoaderData } from "@remix-run/react"
import { auth, db } from "~/config.server"
import Carousel from "~/components/carousel"
import { Button } from "~/components/ui/button"

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await auth.getCurrentUser(request)
  if (!user) return redirect("/auth/login")
  const deliberationId = parseInt(params.deliberationId!)

  const [
    userValuesCount,
    totalValuesCount,
    totalRelationships,
    carouselValues,
  ] = await Promise.all([
    db.valuesCard.count({
      where: {
        deliberationId,
        chat: {
          userId: user.id,
        },
      },
    }),
    db.canonicalValuesCard.count({ where: { deliberationId } }),
    db.edge.count({ where: { deliberationId } }),
    db.canonicalValuesCard.findMany({
      take: 12,
      where: { deliberationId },
      include: {
        _count: {
          select: { edgesTo: true },
        },
        valuesCards: {
          select: {
            chat: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    }),
  ])

  return json({
    userValuesCount,
    totalValuesCount,
    totalRelationships,
    carouselValues,
    prolificId: user.prolificId,
    prolificCompletionCode: process.env.PROLIFIC_COMPLETION_CODE ?? null,
  })
}

export default function FinishedScreen() {
  const {
    prolificId,
    prolificCompletionCode,
    userValuesCount,
    totalValuesCount,
    totalRelationships,
    carouselValues,
  } = useLoaderData<typeof loader>()

  return (
    <div className="flex flex-col min-h-screen w-full overflow-x-hidden">
      <Header />
      <div className="grid flex-grow place-items-center py-8 sm:py-12">
        <div className="flex flex-col items-center mx-auto max-w-xl text-center px-6 sm:px-8">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight mb-8">Thank you</h1>

          <p>
            You've contributed{" "}
            <strong>
              {userValuesCount} value
              {userValuesCount > 1 ? "s" : ""}
            </strong>{" "}
            to our growing <strong>Moral Graph</strong>. So far, participants
            like you have articulated <strong>{totalValuesCount} values</strong>
            . A total of{" "}
            <strong>{totalRelationships} value-to-value relationships</strong>{" "}
            have been submitted.
          </p>
        </div>

        {prolificId && prolificCompletionCode && (
          <div className="my-16">
            <Button
              size="lg"
              onClick={() => {
                window.location.href = `https://app.prolific.com/submissions/complete?cc=${prolificCompletionCode}`
              }}
            >
              Complete Study
            </Button>
          </div>
        )}

        <div className="overflow-x-hidden w-full h-full flex justify-center mt-16">
          <Carousel cards={carouselValues as any[]} />
        </div>
      </div>
    </div>
  )
}
