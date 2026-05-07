import { useEffect, useRef, useState } from "react"
import { useNavigation } from "@remix-run/react"
import { cn } from "~/lib/utils"

/**
 * Top-of-viewport progress bar that animates while navigation or a fetcher
 * submission is pending. Read by `useNavigation()`. Mounted once in
 * app/root.tsx so it covers every route.
 *
 * Animation strategy:
 *   - On state change to "loading"|"submitting": start at 8%, ease toward 90%.
 *   - On state back to "idle": jump to 100%, fade out, reset.
 * Avoids a perpetual stuck bar even if a navigation gets canceled.
 */
export function NavigationProgress() {
  const navigation = useNavigation()
  const active = navigation.state !== "idle"
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (active) {
      setVisible(true)
      setProgress(8)
      // Ease asymptotically toward 90% so we always have headroom for
      // the actual finish.
      timer.current = setInterval(() => {
        setProgress((p) => {
          if (p >= 90) return p
          const remaining = 90 - p
          // Slower as we approach 90%.
          return Math.min(90, p + remaining * 0.08)
        })
      }, 200)
    } else {
      if (timer.current) {
        clearInterval(timer.current)
        timer.current = null
      }
      // Snap to 100, then hide after a beat.
      setProgress(100)
      const t = setTimeout(() => {
        setVisible(false)
        setProgress(0)
      }, 250)
      return () => clearTimeout(t)
    }
    return () => {
      if (timer.current) {
        clearInterval(timer.current)
        timer.current = null
      }
    }
  }, [active])

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-[100] h-0.5 pointer-events-none transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0"
      )}
      aria-hidden="true"
    >
      <div
        className="h-full bg-emerald-500 transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
