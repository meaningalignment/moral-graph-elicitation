import {
  ActionFunctionArgs,
  json,
  LoaderFunctionArgs,
} from "@remix-run/node"
import { Link, useLoaderData, useParams } from "@remix-run/react"
import { db } from "~/config.server"
import { runTaskFromForm, updateCardFromForm } from "~/services/critique"
import { ValuesCardEditor } from "~/components/values-card-editor"

export async function loader({ params }: LoaderFunctionArgs) {
  const card = await db.canonicalValuesCard.findUniqueOrThrow({
    where: { id: Number(params.canonicalCardId) },
    include: {
      valuesCards: {
        include: {
          chat: true,
        },
      },
    },
  })
  if (!card) throw new Error("Card not found")
  return json({ card })
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData()
  const action = formData.get("action") as string
  if (!action) {
    await updateCardFromForm(formData)
    return null
  } else if (action === "task") {
    return await runTaskFromForm(formData)
  } else {
    return json({ error: "Unknown action" }, { status: 400 })
  }
}

function Chats() {
  const { card } = useLoaderData<typeof loader>()
  const { deliberationId } = useParams()

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <h1 className="text-xl font-semibold tracking-tight my-8 text-center">Chats</h1>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mx-auto gap-4">
        {card.valuesCards.map((c) => (
          <Link
            prefetch="intent"
            to={`/dashboard/${deliberationId}/${c.chat!.id}`}
            className="mb-6"
          >
            {c.chat!.id}
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function EditCardPage() {
  const { card } = useLoaderData<typeof loader>()

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <ValuesCardEditor card={card} cardType="canonical" />
      <Chats />
    </div>
  )
}
