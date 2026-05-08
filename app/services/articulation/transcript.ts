import type { UIMessage } from "ai"
import type { ChatMessage } from "./chat"

/**
 * Convert our internal ChatMessage[] (the OpenAI-style shape we persist in
 * Chat.transcript) into ai@6's UIMessage[] for rendering in the chat UI.
 *
 * - "system" messages are dropped (the UI never shows them; the LLM call
 *   re-adds the system prompt).
 * - "user" / "assistant" messages become UIMessages with a single text part.
 * - "tool" messages (responses from `submit_values_card`) are also dropped
 *   from the user-visible transcript; the values card itself shows up via
 *   the tool-call UIMessagePart on the preceding assistant message.
 */
export function chatMessagesToUIMessages(
  msgs: ChatMessage[]
): UIMessage[] {
  const out: UIMessage[] = []
  for (const m of msgs) {
    if (m.role !== "user" && m.role !== "assistant") continue
    const text = m.content ?? ""
    const parts: any[] = []
    if (text) parts.push({ type: "text", text })
    if (m.role === "assistant" && m.tool_calls?.length) {
      for (const call of m.tool_calls) {
        if (call.type !== "function") continue
        let input: any = undefined
        try {
          input = JSON.parse(call.function.arguments)
        } catch {
          input = call.function.arguments
        }
        parts.push({
          type: `tool-${call.function.name}`,
          toolCallId: call.id,
          state: "output-available",
          input,
          output: { ok: true },
        })
      }
    }
    if (parts.length === 0) continue
    out.push({
      id: `chat-${out.length}`,
      role: m.role,
      parts,
    } as UIMessage)
  }
  return out
}

/**
 * Convert ai@6 UIMessage[] (the shape the client sends us) into our internal
 * ChatMessage[] for persistence and for re-prompting the LLM.
 *
 * - Each UIMessage's text parts are joined into a single string.
 * - Tool-call parts on assistant messages are translated back into
 *   tool_calls + corresponding "tool" role messages with the output.
 */
export function uiMessagesToChatMessages(
  msgs: UIMessage[]
): ChatMessage[] {
  const out: ChatMessage[] = []
  for (const m of msgs) {
    if (m.role !== "user" && m.role !== "assistant" && m.role !== "system") {
      continue
    }
    const textParts = m.parts.filter((p: any) => p.type === "text")
    const text = textParts.map((p: any) => p.text).join("\n")
    const toolParts = m.parts.filter(
      (p: any) => typeof p.type === "string" && p.type.startsWith("tool-")
    )
    const tool_calls = toolParts.map((p: any) => ({
      id: p.toolCallId,
      type: "function" as const,
      function: {
        name: p.type.replace(/^tool-/, ""),
        arguments: JSON.stringify(p.input ?? {}),
      },
    }))
    out.push({
      role: m.role as ChatMessage["role"],
      content: text || null,
      tool_calls: tool_calls.length ? tool_calls : undefined,
    })
    // Emit a tool-result message after each tool call so the transcript is
    // valid OpenAI shape (assistant tool_call followed by tool result).
    for (const p of toolParts) {
      const part = p as any
      if (part.state !== "output-available") continue
      out.push({
        role: "tool",
        tool_call_id: part.toolCallId,
        name: part.type.replace(/^tool-/, ""),
        content:
          typeof part.output === "string"
            ? part.output
            : JSON.stringify(part.output ?? { ok: true }),
      })
    }
  }
  return out
}
