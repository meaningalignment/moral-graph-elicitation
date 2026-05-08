import { useEffect, useState } from "react"
import { ChatMessage } from "./chat-message"

export default function StaticChatMessage({
  text,
  isFinished,
  onFinished,
  role,
  fastMode,
}: {
  text: string
  isFinished: boolean
  onFinished: () => void
  role?: "assistant" | "user"
  fastMode?: boolean
}) {
  const [currentText, setCurrentText] = useState("")

  useEffect(() => {
    if (isFinished) {
      setCurrentText(text)
      return
    }

    setCurrentText("")

    let wordArray = text.split(" ")
    let current = ""
    let i = 0

    // Function to add next word
    const addNextWord = () => {
      current += (i === 0 ? "" : " ") + wordArray[i]
      setCurrentText(current)
      i += 1

      if (i < wordArray.length) {
        setTimeout(addNextWord, fastMode ? 20 : 40)
      } else {
        onFinished()
      }
    }

    // Start adding words
    addNextWord()
  }, [text])

  return (
    <div className="w-full max-w-2xl flex items-stretch">
      <ChatMessage
        hideActions={true}
        message={{
          id: "1",
          role: role ?? "assistant",
          parts: [{ type: "text", text: currentText }],
        }}
      />
    </div>
  )
}
