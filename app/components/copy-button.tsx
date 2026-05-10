import { useState } from "react"
import { Check, Copy } from "lucide-react"

/**
 * Small client-side button that copies a string to the clipboard. Shows a
 * brief check after copy. Falls back to selecting the text if clipboard
 * permissions are denied (older browsers / non-https local dev).
 */
export function CopyButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback for non-clipboard contexts.
        const ta = document.createElement("textarea")
        ta.value = text
        ta.style.position = "fixed"
        ta.style.opacity = "0"
        document.body.appendChild(ta)
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      console.warn("Copy failed:", e)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border bg-white hover:bg-muted ${className}`}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" /> {label}
        </>
      )}
    </button>
  )
}
