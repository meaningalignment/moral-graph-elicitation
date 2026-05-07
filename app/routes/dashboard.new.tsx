import { ActionFunction, json, redirect, LoaderFunction } from "@remix-run/node"
import {
  Form,
  useActionData,
  useNavigate,
  useLoaderData,
} from "@remix-run/react"
import { useEffect, useState } from "react"
import { auth, db, inngest } from "~/config.server"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import { Label } from "~/components/ui/label"
import LoadingButton from "~/components/loading-button"
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group"
import {
  unstable_parseMultipartFormData,
  unstable_createMemoryUploadHandler,
} from "@remix-run/node"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  allContexts,
  generateScenario,
  parseScenarioGenerationData as parseScenarioGenData,
} from "~/services/scenario-generation"
import { seedQuestionsAndContextsCore } from "~/services/generation"
import { Deliberation } from "@prisma/client"

/** Fire a background promise that survives the response. Plays nicely
 * both in local Node (the process keeps it alive) and on Vercel
 * serverless (where the lambda will hold for up to maxDuration).
 *
 * Vercel's @vercel/functions exports `waitUntil` for the same purpose;
 * we don't import it to avoid a hard dep on the runtime. */
function fireAndForget(label: string, fn: () => Promise<unknown>) {
  fn().catch((e) => {
    console.error(`[bg ${label}] ${(e as Error).message}`)
  })
}

async function handleTopicSubmission(deliberationData: {
  title: string
  welcomeText: string
  topic: string
  userId: number
  numQuestions: number
  numContexts: number
}) {
  const { title, welcomeText, topic, userId, numContexts, numQuestions } =
    deliberationData

  const deliberation = await db.deliberation.create({
    data: {
      title,
      welcomeText,
      topic,
      user: { connect: { id: userId } },
    },
  })

  // Send the Inngest event for production (where Inngest cloud picks it up).
  // Don't await — if Inngest isn't configured, we don't want to block.
  inngest
    .send({
      name: "gen-seed-questions-contexts",
      data: {
        deliberationId: deliberation.id,
        topic,
        numQuestions,
        numContexts,
      },
    })
    .catch((e) =>
      console.warn("inngest.send failed (non-fatal):", (e as Error).message)
    )

  // ALSO run the seed directly as a background promise. This makes the seed
  // work in local dev (where `npm run inngest` may not be running) and as a
  // safety net in production. Inngest itself is idempotent on its event id,
  // and the seed function early-exits if questions already exist (writes are
  // upserts), so a double-run is harmless.
  fireAndForget(`seed delib ${deliberation.id}`, () =>
    seedQuestionsAndContextsCore({
      deliberationId: deliberation.id,
      topic,
      numQuestions,
      numContexts,
    })
  )

  return deliberation
}

async function handleQuestionsFileSubmission(
  deliberationData: {
    title: string
    welcomeText: string
    topic: string | null
    userId: number
  },
  questionsFile: File
) {
  const { title, welcomeText, topic, userId } = deliberationData

  const questions = (await questionsFile.text())
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))

  if (questions.find((q: any) => !q.question || !q.title)) {
    throw new Error(
      "Invalid questions format. Each question must have 'question' and 'title' fields."
    )
  }

  const deliberation = await db.deliberation.create({
    data: {
      title,
      welcomeText,
      topic: topic ?? title,
      user: { connect: { id: userId } },
    },
  })

  const dbQuestions = await Promise.all(
    questions.map((q: any) =>
      db.question.create({
        data: {
          title: q.title,
          question: q.question,
          deliberationId: deliberation.id,
        },
      })
    )
  )

  await inngest.send({
    name: "gen-seed-contexts",
    data: {
      deliberationId: deliberation.id,
      questionIds: dbQuestions.map((q) => q.id),
      topic,
    },
  })

  return deliberation
}

async function handleContextsFileSubmission(
  deliberationData: {
    title: string
    welcomeText: string
    topic: string | null
    userId: number
    numQuestions: number
  },
  contextsFile: File
) {
  const { title, welcomeText, userId, numQuestions } = deliberationData
  const data = parseScenarioGenData(JSON.parse(await contextsFile.text()))

  if (!data) {
    throw new Error(
      "Invalid contexts format. Each context must have required fields."
    )
  }

  const deliberation = await db.deliberation.create({
    data: {
      title,
      welcomeText,
      topic: data.topic,
      user: { connect: { id: userId } },
    },
  })

  await inngest.send({
    name: "gen-seed-questions",
    data: {
      deliberationId: deliberation.id,
      numQuestions,
      schema: JSON.stringify(data),
    },
  })

  return deliberation
}

export const action: ActionFunction = async ({ request }) => {
  const uploadHandler = unstable_createMemoryUploadHandler()
  const formData = await unstable_parseMultipartFormData(request, uploadHandler)

  const user = await auth.getCurrentUser(request)
  if (!user) return redirect("/auth/login")

  const topic = formData.get("topic") as string
  const title = formData.get("title") as string
  const welcomeText = formData.get("welcomeText") as string
  const questionsFile = formData.get("questionsFile") as File | null
  const contextsFile = formData.get("contextsFile") as File | null
  const numQuestions = parseInt((formData.get("numQuestions") || "5") as string)
  const numContexts = parseInt((formData.get("numContexts") || "5") as string)

  const deliberationData = {
    title,
    welcomeText,
    topic,
    userId: user.id,
    numQuestions,
    numContexts,
  }

  try {
    let deliberation: Deliberation

    if (topic) {
      deliberation = await handleTopicSubmission(deliberationData)
    } else if (questionsFile) {
      deliberation = await handleQuestionsFileSubmission(
        deliberationData,
        questionsFile
      )
    } else if (contextsFile) {
      deliberation = await handleContextsFileSubmission(
        deliberationData,
        contextsFile
      )
    }

    return redirect(`/dashboard/${deliberation!.id}`)
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 400 }
    )
  }
}

export const loader: LoaderFunction = async () => {
  return json({
    enableAlternativeInputs: process.env.ENABLE_ALTERNATIVE_INPUTS === "true",
  })
}

export default function NewDeliberation() {
  const navigate = useNavigate()
  const { enableAlternativeInputs } = useLoaderData<typeof loader>()
  const [topic, setQuestion] = useState("")
  const [title, setTitle] = useState("")
  const [inputMethod, setInputMethod] = useState<
    "topic" | "questions" | "contexts"
  >("topic")
  const [hasFile, setHasFile] = useState(false)
  const [numQuestions, setNumQuestions] = useState("3")
  const [numContexts, setNumContexts] = useState("3")

  const actionData = useActionData<{ error?: string }>()

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error)
    }
  }, [actionData])

  return (
    <div className="w-full max-w-2xl mx-auto mt-12">
      <h1 className="text-2xl font-bold mb-2">Create New Deliberation</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Enter a topic to get started. Questions and contexts are generated
        automatically in the background. Once ready, you can simulate
        participants from the dashboard.
      </p>
      <Form method="post" className="space-y-8" encType="multipart/form-data">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            className="mt-2"
            id="title"
            name="title"
            placeholder="eg. SF Homelessness"
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <p className="text-sm text-muted-foreground mt-2">
            This will be the title of your deliberation.
          </p>
        </div>
        <div>
          <Label htmlFor="welcomeText">Welcome Text</Label>
          <Textarea
            className="mt-2"
            id="welcomeText"
            name="welcomeText"
            placeholder="Enter the welcome text (optional)"
          />
          <p className="text-sm text-muted-foreground mt-2">
            When participants join your deliberation, they will be greeted with
            this text.
          </p>
        </div>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Questions</h2>
          {enableAlternativeInputs && (
            <RadioGroup
              defaultValue="topic"
              value={inputMethod}
              onValueChange={(value) =>
                setInputMethod(value as "topic" | "questions" | "contexts")
              }
              className="flex space-x-8"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="topic" id="topic-input" />
                <Label htmlFor="topic-input">Generate From Topic</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="questions" id="questions-input" />
                <Label htmlFor="questions-input">Upload Questions</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="contexts" id="contexts-input" />
                <Label htmlFor="contexts-input">Upload Schema</Label>
              </div>
            </RadioGroup>
          )}
        </div>

        {inputMethod === "topic" ? (
          <div className="space-y-6">
            <div>
              <Label htmlFor="topic">Topic</Label>
              <Input
                className="mt-2"
                id="topic"
                name="topic"
                placeholder="eg. What should the SF government do about homelessness?"
                required={inputMethod === "topic"}
                type="text"
                value={topic}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <p className="text-sm text-muted-foreground mt-2">
                Questions will be generated based on this topic in the
                background.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8">
              <div className="w-full">
                <Label htmlFor="numQuestions">Number of Questions</Label>
                <Select
                  name="numQuestions"
                  value={numQuestions}
                  onValueChange={setNumQuestions}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-2">
                  How many questions to generate for the topic
                </p>
              </div>
              <div className="w-full">
                <Label htmlFor="numContexts">Contexts per Question</Label>
                <Select
                  name="numContexts"
                  value={numContexts}
                  onValueChange={setNumContexts}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-2">
                  How many contexts to generate per question
                </p>
              </div>
            </div>
          </div>
        ) : inputMethod === "questions" ? (
          <div>
            <Label htmlFor="questionsFile">Questions File (JSONL)</Label>
            <div className="flex items-center gap-4 mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  document.getElementById("questionsFile")?.click()
                }
              >
                Choose File
              </Button>
              <Input
                className="hidden"
                id="questionsFile"
                name="questionsFile"
                type="file"
                accept=".jsonl"
                required={inputMethod === "questions"}
                onChange={(e) => {
                  const fileName = e.target.files?.[0]?.name
                  const fileLabel = document.getElementById("fileLabel")
                  if (fileLabel) {
                    fileLabel.textContent = fileName || "No file chosen"
                  }
                  setHasFile(!!fileName)
                }}
              />
              <span id="fileLabel" className="text-sm text-muted-foreground">
                No file chosen
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Upload a JSONL file containing your questions. Each line should be
              a JSON object with "question" and "title" fields.
            </p>
          </div>
        ) : inputMethod === "contexts" ? (
          <div>
            <Label htmlFor="contextsFile">Generation Schema (JSON)</Label>
            <div className="flex items-center gap-4 mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById("contextsFile")?.click()}
              >
                Choose File
              </Button>
              <Input
                className="hidden"
                id="contextsFile"
                name="contextsFile"
                type="file"
                accept=".json"
                required={inputMethod === "contexts"}
                onChange={(e) => {
                  const fileName = e.target.files?.[0]?.name
                  const fileLabel = document.getElementById("contextsLabel")
                  if (fileLabel) {
                    fileLabel.textContent = fileName || "No file chosen"
                  }
                  setHasFile(!!fileName)
                }}
              />
              <span
                id="contextsLabel"
                className="text-sm text-muted-foreground"
              >
                No file chosen
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Upload a JSON file with a question generation schema.
            </p>

            <div className="mt-6 w-1/2">
              <Label htmlFor="numQuestions">Number of Questions</Label>
              <Select
                name="numQuestions"
                value={numQuestions}
                onValueChange={setNumQuestions}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {[...Array(12)].map((_, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>
                      {i + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-2">
                How many representative questions to generate
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <LoadingButton
            type="submit"
            disabled={!title || (inputMethod === "topic" ? !topic : !hasFile)}
          >
            Create Deliberation
          </LoadingButton>
        </div>
      </Form>
    </div>
  )
}
