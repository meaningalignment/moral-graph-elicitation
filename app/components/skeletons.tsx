import { Card, CardContent, CardHeader } from "~/components/ui/card"
import { Skeleton } from "~/components/ui/skeleton"
import { cn } from "~/lib/utils"

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === lines - 1 ? "w-2/3" : i % 2 ? "w-5/6" : "w-full"
          )}
        />
      ))}
    </div>
  )
}

export function SkeletonStat() {
  return (
    <div className="flex justify-between items-center">
      <div className="space-y-2 flex-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-6 w-8" />
    </div>
  )
}

export function SkeletonCard({
  bodyLines = 2,
  className,
}: {
  bodyLines?: number
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-1/3" />
      </CardHeader>
      <CardContent>
        <SkeletonText lines={bodyLines} />
      </CardContent>
    </Card>
  )
}

export function SkeletonRow({ cols = 3 }: { cols?: number }) {
  return (
    <div className="flex gap-4 py-2">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
  )
}

/** Mimics the ValuesCard component shape used in /values, /chats etc. */
export function SkeletonValuesCard() {
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3 shadow-sm">
      <Skeleton className="h-5 w-2/3" />
      <SkeletonText lines={2} />
      <div className="space-y-1.5 pt-1">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  )
}

export function SkeletonValuesGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonValuesCard key={i} />
      ))}
    </div>
  )
}

export function SkeletonTable({
  rows = 6,
  cols = 3,
}: {
  rows?: number
  cols?: number
}) {
  return (
    <div className="divide-y rounded-md border bg-white">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-3">
          <SkeletonRow cols={cols} />
        </div>
      ))}
    </div>
  )
}
