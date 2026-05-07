import { ActionFunction, LoaderFunction, redirect } from "@remix-run/node"
import { Form, useLoaderData, useNavigate } from "@remix-run/react"
import { useState } from "react"
import { auth, db } from "~/config.server"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import { Label } from "~/components/ui/label"
import LoadingButton from "~/components/loading-button"

export const loader: LoaderFunction = async ({ params, request }) => {
  const user = await auth.getCurrentUser(request)
  if (!user) return redirect("/auth/login")

  const deliberation = await db.deliberation.findUnique({
    where: { id: parseInt(params.deliberationId!) },
  })

  if (!deliberation) {
    throw new Response("Not Found", { status: 404 })
  }

  if (deliberation.createdBy !== user.id) {
    throw new Response("Unauthorized", { status: 403 })
  }

  return { deliberation }
}

export const action: ActionFunction = async ({ request, params }) => {
  const formData = await request.formData()
  const user = await auth.getCurrentUser(request)
  if (!user) return redirect("/auth/login")

  const title = formData.get("title") as string
  const welcomeText = formData.get("welcomeText") as string
  const topic = formData.get("topic") as string

  await db.deliberation.update({
    where: { id: parseInt(params.deliberationId!) },
    data: {
      title,
      welcomeText,
      topic,
    },
  })

  return redirect(`/dashboard/${params.deliberationId}`)
}

export default function EditDeliberation() {
  const { deliberation } = useLoaderData<typeof loader>()
  const navigate = useNavigate()
  const [topic, setTopic] = useState(deliberation.topic)
  const [title, setTitle] = useState(deliberation.title)

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h1 className="font-serif text-2xl font-semibold tracking-tight mb-8">Edit Deliberation</h1>
      <Form method="post" className="space-y-8">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            className="mt-2"
            id="title"
            name="title"
            placeholder="Enter the deliberation title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <p className="text-sm text-muted-foreground mt-2">
            This is the title of your deliberation.
          </p>
        </div>
        <div>
          <Label htmlFor="welcomeText">Welcome Text</Label>
          <Textarea
            className="mt-2"
            id="welcomeText"
            name="welcomeText"
            placeholder="Enter the welcome text (optional)"
            defaultValue={deliberation.welcomeText || ""}
          />
          <p className="text-sm text-muted-foreground mt-2">
            When participants join your deliberation, they will be greeted with
            this text.
          </p>
        </div>
        <div>
          <Label htmlFor="topic">Topic</Label>
          <Input
            className="mt-2"
            id="topic"
            name="topic"
            placeholder="Enter your topic"
            required
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <p className="text-sm text-muted-foreground mt-2">
            This is the topic that participants will deliberate about.
          </p>
        </div>
        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <LoadingButton type="submit" disabled={!topic || !title}>
            Save Changes
          </LoadingButton>
        </div>
      </Form>
    </div>
  )
}
