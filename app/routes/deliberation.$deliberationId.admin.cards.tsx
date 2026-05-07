import { Link, useLoaderData, useParams } from "@remix-run/react"
import { LoaderFunctionArgs, json } from "@remix-run/node"
import { auth, db } from "~/config.server"
import ValuesCard from "~/components/values-card"
import { CanonicalValuesCard } from "@prisma/client"

export async function loader({ request, params }: LoaderFunctionArgs) {
  if ((await auth.getCurrentUser(request))?.isAdmin !== true) {
    throw new Error("Unauthorized")
  }

  const deliberationId = Number(params.deliberationId)

  const values = (await db.canonicalValuesCard.findMany({
    where: { deliberationId, isArchived: false },
    orderBy: { title: "asc" },
  })) as CanonicalValuesCard[]

  return json({ values, deliberationId })
}

export default function AdminCardsScreen() {
  const { values, deliberationId } = useLoaderData<typeof loader>()
  return (
    <div className="flex flex-col w-screen">
      <div className="grid flex-grow place-items-center space-y-8 py-12 mx-3">
        <div className="flex flex-col justify-center items-center">
          <h1 className="text-3xl text-center">
            <b>{values.length}</b> Cards
          </h1>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mx-auto gap-4">
          {values.map((value) => (
            <Link
              key={value.id}
              prefetch="intent"
              to={`/dashboard/${deliberationId}/card/${value.id}`}
            >
              <div className="cursor-pointer hover:opacity-80 active:opacity-70 hover:duration-0 hover:transition-none opacity-100">
                <ValuesCard detailsInline card={value as any} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
