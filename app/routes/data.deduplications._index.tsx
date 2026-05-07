import { LoaderFunctionArgs, json } from "@remix-run/node"
import { useLoaderData } from "@remix-run/react"
import { IconArrowRight } from "~/components/ui/icons"
import ValuesCard from "~/components/values-card"
import {
  CanonicalValuesCard,
  ValuesCard as ValuesCardType,
} from "@prisma/client"
import { db } from "~/config.server"
import { cn } from "~/lib/utils"

type Response = "same" | "different"
type Pair = {
  card: ValuesCardType
  canonical: CanonicalValuesCard
  response: Response | null
}

function isDifferent(card: ValuesCardType, canonical: CanonicalValuesCard) {
  return (
    card.title != canonical.title ||
    card.description != canonical.description ||
    JSON.stringify(canonical.policies) != JSON.stringify(card.policies)
  )
}

export async function loader({ request }: LoaderFunctionArgs) {
  const pairs = (
    await db.valuesCard.findMany({
      where: {
        canonicalCardId: { not: null },
      },
      include: {
        canonicalCard: true,
      },
      orderBy: { createdAt: "desc" },
    })
  )
    .map((vc) => {
      return {
        card: vc,
        canonical: vc.canonicalCard!,
      }
    })
    .filter((p) => isDifferent(p.card, p.canonical))

  return json({ pairs })
}

function Canonicalization({ pair }: { pair: Pair }) {
  return (
    <div>
      <div className="w-full max-w-2xl"></div>
      <div
        className={cn(
          `grid grid-cols-1 md:grid-cols-3 mx-auto gap-4 items-center justify-items-center md:grid-cols-[max-content,min-content,max-content] mb-4`
        )}
      >
        <div key={pair.card.id} className="flex flex-col h-full">
          <a
            className="mx-8 mb-2 text-sm text-muted-foreground underline"
            href={`/admin/chats/${pair.card.chatId}`}
          >
            Articulated {new Date(pair.card.createdAt).toLocaleDateString()}
          </a>
          <div className="flex-grow h-full w-96">
            <ValuesCard card={pair.card} detailsInline />
          </div>
        </div>
        <IconArrowRight className="h-8 w-8 mx-auto rotate-90 md:rotate-0" />
        <div key={pair.canonical.id} className="flex flex-col h-full">
          <p className="mx-8 mb-2 text-sm text-muted-foreground">
            Canonical Version
          </p>
          <div className="flex-grow h-full w-96">
            <ValuesCard card={pair.canonical} detailsInline />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function UserDeduplications() {
  const { pairs } = useLoaderData<typeof loader>()

  if (!pairs.length)
    return (
      <div className="grid place-items-center space-y-4 py-24 px-8">
        <div className="flex flex-col items-center justify-center">
          <div className="font-serif text-3xl font-semibold tracking-tight mb-2">No deduplications</div>
          <div className="text-xl text-center">
            All of your cards were used exactly as you articulated them.
          </div>
        </div>
      </div>
    )

  return (
    <div className="grid place-items-center space-y-8 px-8 mb-8">
      <div className="flex flex-col items-center justify-center my-8">
        <div className="text-3xl text-center font-bold mb-2 mt-12 max-w-2xl">
          Articulated cards and their canonical versions
        </div>
      </div>
      {pairs.map((p) => (
        <Canonicalization
          key={`${p.card.id}_${p.canonical.id}`}
          pair={p as any}
        />
      ))}
    </div>
  )
}
