import * as React from "react"
import { cn } from "~/lib/utils"

/**
 * Skeleton — pulses while data is loading. Match shapes to the real UI.
 * shadcn-style; pairs with Tailwind's animate-pulse.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-200", className)}
      {...props}
    />
  )
}
