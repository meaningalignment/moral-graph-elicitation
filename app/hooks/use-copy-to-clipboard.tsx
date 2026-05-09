'use client'

import * as React from 'react'

export interface useCopyToClipboardProps {
  timeout?: number
}

export function useCopyToClipboard({
  timeout = 2000
}: useCopyToClipboardProps) {
  const [isCopied, setIsCopied] = React.useState<Boolean>(false)

  const copyToClipboard = (value: string) => {
    if (typeof window === 'undefined' || !navigator.clipboard?.writeText) {
      return
    }

    if (!value) {
      return
    }

    navigator.clipboard
      .writeText(value)
      .then(() => {
        setIsCopied(true)

        setTimeout(() => {
          setIsCopied(false)
        }, timeout)
      })
      .catch(() => {
        // Clipboard permission can be denied; swallow rather than throw an
        // unhandled rejection. The button just won't switch to the copied state.
      })
  }

  return { isCopied, copyToClipboard }
}
