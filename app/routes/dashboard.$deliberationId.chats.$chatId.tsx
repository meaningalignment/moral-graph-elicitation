import { LoaderFunctionArgs, json } from "@remix-run/node"
import { useLoaderData } from "@remix-run/react"
import { Message } from "ai"
import { ChatList } from "~/components/chat/chat-list"
import { auth, db } from "~/config.server"

export async function loader({ params, request }: LoaderFunctionArgs) {
  const chatId = params.chatId!
  const userId = await auth.getUserId(request)
  const chat = await db.chat.findUnique({
    where: { id: chatId },
  })
  const cardId = (
    await db.canonicalValuesCard.findFirst({
      where: {
        valuesCards: {
          some: {
            chatId,
          },
        },
      },
    })
  )?.id
  if (!chat) throw new Error("Chat not found")
  const evaluation = chat?.evaluation as Record<string, string>
  const messages = (chat?.transcript as any as Message[]).slice(1).map((m) => {
    if (m.function_call) {
      m.content = JSON.stringify(m.function_call, null, 2)
    }

    return m
  })
  return json({
    messages,
    evaluation,
    chatId,
    cardId,
    chat,
    isUser: chat?.userId === userId,
  })
}

// function EvaluateButton() {
//   const { chatId } = useLoaderData<typeof loader>()
//   const { state } = useNavigation()
//   return (
//     <Form method="post" className="mt-4 text-right">
//       <input type="hidden" name="chatId" value={chatId} />
//       {state === "submitting" ? (
//         "Evaluating..."
//       ) : (
//         <Button type="submit" size="sm" variant="secondary">
//           Evaluate
//         </Button>
//       )}
//     </Form>
//   )
// }

// function ValuesCardButton() {
//   const { cardId } = useLoaderData<typeof loader>()

//   return (
//     <a href={`/admin/card/${cardId}`}>
//       <Button size="sm" variant="ghost">
//         See Values Card
//       </Button>
//     </a>
//   )
// }

// function DebugButton({
//   chatId,
//   shouldDuplicate,
// }: {
//   chatId: string
//   shouldDuplicate: boolean
// }) {
//   const [isLoading, setIsLoading] = useState(false)

//   const onClick = async () => {
//     setIsLoading(true)
//   }

//   return (
//     <Link
//       to={
//         shouldDuplicate ? `/admin/chats/${chatId}/duplicate` : `/chat/${chatId}`
//       }
//     >
//       <Button disabled={isLoading} onClick={onClick}>
//         {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
//         {shouldDuplicate ? "Duplicate & Debug" : "Debug"}
//       </Button>
//     </Link>
//   )
// }

// function InfoBlock({
//   title,
//   details,
// }: {
//   title: string
//   details: Record<string, string>
// }) {
//   const keys = Object.keys(details).sort((a, b) => a.localeCompare(b))
//   return (
//     <div>
//       <h1 className="text-lg mt-2">{title}</h1>
//       {keys.map((key) => (
//         <div key={key} className="grid grid-cols-2 w-full">
//           <div className="text-xs">{key}</div>
//           <div className="text-xs text-red-900">{details[key]}</div>
//         </div>
//       ))}
//     </div>
//   )
// }

export default function AdminChat() {
  const { messages } = useLoaderData<typeof loader>()

  if (!messages || messages.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 mt-12">
        <div className="rounded-lg border bg-card p-8">
          <h1 className="mb-2 text-lg font-semibold">No Transcript</h1>
          <p className="mb-2 leading-normal text-muted-foreground">
            Transcript is not available for this chat.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ChatList
      messages={messages as Message[]}
      // @ts-ignore
      isFinished={true}
      isLoading={false}
      valueCards={[]}
      onManualSubmit={() => {}}
    />
  )
}
