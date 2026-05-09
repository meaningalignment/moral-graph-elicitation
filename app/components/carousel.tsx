import { CanonicalValuesCard } from "@prisma/client"
import { useEffect, useRef } from "react"
import ValuesCard from "./values-card"

type CardWithCounts = CanonicalValuesCard & {
  valuesCards: { userId: number }[]
  _count: {
    edgesTo: number
  }
}

export default function Carousel({ cards }: { cards: CardWithCounts[] }) {
  const carouselRef = useRef<HTMLDivElement | null>(null)

  const uniqueArticulations = (card: CardWithCounts) => {
    return [...new Set(card.valuesCards.map((c) => c.userId))].length
  }

  const uniqueVotes = (card: CardWithCounts) => {
    return card._count.edgesTo
  }

  const footerText = (card: CardWithCounts) =>
    `${
      uniqueVotes(card) > 0
        ? ` Endorsed by ${uniqueVotes(card)} participant${
            uniqueVotes(card) > 1 ? "s" : ""
          }.`
        : ``
    }`

  useEffect(() => {
    let position = 0
    const scrollAmount = 10
    const transitionSpeed = 1000

    const interval = setInterval(() => {
      if (carouselRef.current) {
        position += scrollAmount
        carouselRef.current.style.transform = `translateX(-${position}px)`
        carouselRef.current.style.transition = `transform ${transitionSpeed}ms linear`
      }
    }, transitionSpeed)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="relative z-0 w-full">
      <div ref={carouselRef} className="flex hide-scrollbar space-x-4">
        {cards.map((card) => (
          <div key={card.id} className="flex flex-col shrink-0">
            <div className="flex-grow w-[80vw] sm:w-96 max-w-sm">
              <ValuesCard card={card} />
            </div>
            <p className="mx-8 mt-2 text-sm text-muted-foreground">
              {footerText(card)}
            </p>
          </div>
        ))}
      </div>

      <div className="absolute inset-y-0 left-0 w-12 sm:w-32 bg-gradient-to-r from-background to-transparent z-20 pointer-events-none"></div>
      <div className="absolute inset-y-0 right-0 w-12 sm:w-32 bg-gradient-to-l from-background to-transparent z-20 pointer-events-none"></div>
    </div>
  )
}
