import { useEffect, useState } from "react"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Loader2, Plus, Sparkles } from "lucide-react"
import { cn } from "~/lib/utils"

type PoliticalAffiliation =
  | "liberal"
  | "conservative"
  | "libertarian"
  | "moderate"
  | "other"

export type Persona = {
  name: string
  slug: string
  description?: string
  demographic: string
  politicalAffiliation?: PoliticalAffiliation
  voice: string
  leanings: string[]
}

const AFFILIATION_STYLES: Record<PoliticalAffiliation, string> = {
  liberal: "bg-blue-100 text-blue-900 border-blue-200",
  conservative: "bg-red-100 text-red-900 border-red-200",
  libertarian: "bg-amber-100 text-amber-900 border-amber-200",
  moderate: "bg-muted text-foreground border-border",
  other: "bg-purple-100 text-purple-900 border-purple-200",
}

function AffiliationBadge({ value }: { value?: PoliticalAffiliation }) {
  if (!value) return null
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        AFFILIATION_STYLES[value]
      )}
    >
      {value}
    </span>
  )
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
}

function PersonaCard({
  persona,
  selected,
  onToggle,
}: {
  persona: Persona
  selected: boolean
  onToggle: () => void
}) {
  return (
    <div
      role="button"
      onClick={onToggle}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
        selected
          ? "border-primary bg-muted"
          : "border-border hover:bg-muted"
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5"
      />
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
        {initials(persona.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{persona.name}</span>
          <AffiliationBadge value={persona.politicalAffiliation} />
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {persona.description ?? persona.demographic}
        </p>
      </div>
    </div>
  )
}

export function SimulateDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (b: boolean) => void
  onSubmit: (personas: Persona[]) => void
}) {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [brief, setBrief] = useState("")
  const [genAffiliation, setGenAffiliation] = useState<
    PoliticalAffiliation | ""
  >("")

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch("/api/personas")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: { personas: Persona[] }) => {
        if (cancelled) return
        setPersonas(data.personas)
        // Default selection: all 6 seed personas.
        setSelected(new Set(data.personas.map((p) => p.slug)))
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [open])

  const toggle = (slug: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })

  const generate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const r = await fetch("/api/personas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: brief || undefined,
          politicalAffiliation: genAffiliation || undefined,
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = (await r.json()) as { persona: Persona; error?: string }
      if (data.error) throw new Error(data.error)
      // Append the new persona and select it. Ensure unique slug.
      const baseSlug = data.persona.slug
      let slug = baseSlug
      let i = 2
      while (personas.some((p) => p.slug === slug)) {
        slug = `${baseSlug}-${i++}`
      }
      const persona = { ...data.persona, slug }
      setPersonas((p) => [...p, persona])
      setSelected((s) => new Set([...s, slug]))
      setBrief("")
      setGenAffiliation("")
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const submit = () => {
    const chosen = personas.filter((p) => selected.has(p.slug))
    onSubmit(chosen)
  }

  const selectedCount = selected.size
  const estMin = Math.max(2, Math.round((selectedCount * 75 + 150) / 60))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Simulate Participants</DialogTitle>
          <DialogDescription>
            Pick or generate personas. Each will go through the full deliberation
            (articulate values → cluster → upgrade stories → vote on transitions).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading personas…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 max-h-[40vh] overflow-y-auto pr-1">
              {personas.map((p) => (
                <PersonaCard
                  key={p.slug}
                  persona={p}
                  selected={selected.has(p.slug)}
                  onToggle={() => toggle(p.slug)}
                />
              ))}
            </div>

            <details className="rounded-md border bg-muted p-3 group">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4" />
                Generate a new persona on the fly
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <Label htmlFor="brief" className="text-xs">
                    Brief (optional)
                  </Label>
                  <Input
                    id="brief"
                    placeholder="e.g. small-business owner from rural Ohio worried about her workers"
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    disabled={generating}
                  />
                </div>
                <div>
                  <Label className="text-xs">Political affiliation (optional)</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {(
                      [
                        "liberal",
                        "conservative",
                        "libertarian",
                        "moderate",
                        "other",
                      ] as const
                    ).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() =>
                          setGenAffiliation((cur) => (cur === a ? "" : a))
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
                          genAffiliation === a
                            ? AFFILIATION_STYLES[a]
                            : "border-border text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={generate}
                  disabled={generating}
                >
                  {generating ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Plus className="h-4 w-4" /> Generate
                    </span>
                  )}
                </Button>
              </div>
            </details>

            {error && (
              <div className="text-sm text-red-600">{error}</div>
            )}
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-3 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {selectedCount} selected · ~{estMin} min
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={selectedCount === 0 || loading}
            >
              Run simulation
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
