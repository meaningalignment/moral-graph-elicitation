import { useEffect, useRef } from "react"

interface ScrollingBadgesProps {
  items: string[]
  onItemClick?: (item: string) => void
}

export function ScrollingBadges({ items, onItemClick }: ScrollingBadgesProps) {
  const carouselRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let position = 0
    const scrollAmount = 1
    const transitionSpeed = 75

    const interval = setInterval(() => {
      if (carouselRef.current) {
        position += scrollAmount
        carouselRef.current.style.transform = `translateX(-${position}px)`
        carouselRef.current.style.transition = `transform ${transitionSpeed}ms linear`

        // Reset position when all items have scrolled
        const containerWidth = carouselRef.current.scrollWidth
        if (position >= containerWidth / 2) {
          position = 0
          carouselRef.current.style.transition = "none"
          carouselRef.current.style.transform = `translateX(0)`
        }
      }
    }, transitionSpeed)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="relative w-full max-w-xl mx-auto">
      <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_20%,black_80%,transparent_100%)]">
        <div ref={carouselRef} className="flex space-x-2">
          {[...items, ...items].map((item, index) => (
            <div
              key={index}
              onClick={() => onItemClick?.(item)}
              className="bg-card rounded-md px-2 py-1 border cursor-pointer hover:bg-muted transition-colors whitespace-nowrap"
            >
              <span className="text-sm text-muted-foreground">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
