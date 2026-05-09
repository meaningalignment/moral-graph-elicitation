import { ActionFunction, json, redirect, LoaderFunction } from "@remix-run/node"
import {
  Form,
  useActionData,
  useNavigate,
} from "@remix-run/react"
import { useEffect, useState } from "react"
import { auth, db, inngest } from "~/config.server"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import { Label } from "~/components/ui/label"
import LoadingButton from "~/components/loading-button"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Plus, X } from "lucide-react"

/** Smart-truncate a question into a 2-5 word title.
 *  "What should SF do about homelessness?" -> "What should SF do…" or similar */
function titleFromQuestion(q: string): string {
  const cleaned = q.trim().replace(/^["“]|["”]$/g, "").replace(/[?.!]+$/, "")
  // First clause (before comma/em-dash/semicolon) capped at ~40 chars.
  const firstClause = cleaned.split(/[,;—]/)[0]
  if (firstClause.length <= 40) return firstClause
  // Otherwise first 4-5 words.
  const words = firstClause.split(/\s+/).slice(0, 5).join(" ")
  return words.length <= 40 ? words : words.slice(0, 40)
}

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData()
  const user = await auth.getCurrentUser(request)
  if (!user) return redirect("/auth/login")

  const title = (formData.get("title") as string)?.trim()
  const welcomeText = (formData.get("welcomeText") as string)?.trim() || null
  const numContexts = parseInt(
    (formData.get("numContexts") || "5") as string,
    10
  )
  // Questions arrive as repeated `questions[]` form fields. Filter out empty ones.
  const rawQuestions = (formData.getAll("questions") as string[])
    .map((s) => s.trim())
    .filter(Boolean)

  if (!title) {
    return json({ error: "Title is required" }, { status: 400 })
  }
  if (rawQuestions.length === 0) {
    return json({ error: "At least one question is required" }, { status: 400 })
  }

  try {
    // Create deliberation + question rows synchronously. The slow part —
    // generating contexts via the LLM — is handed to Inngest so it survives
    // the lambda termination. (A fire-and-forget Promise here would get cut
    // off the moment we redirect on Vercel's Node runtime.)
    const deliberation = await db.deliberation.create({
      data: {
        title,
        welcomeText,
        // The first question doubles as the deliberation's "topic" so we keep
        // the existing schema field meaningful.
        topic: rawQuestions[0],
        setupStatus: "generating_contexts",
        user: { connect: { id: user.id } },
      },
    })

    const createdQuestions = await db.$transaction(
      rawQuestions.map((question) =>
        db.question.create({
          data: {
            question,
            title: titleFromQuestion(question),
            deliberationId: deliberation.id,
          },
        })
      )
    )

    await inngest.send({
      name: "gen-seed-contexts",
      data: {
        deliberationId: deliberation.id,
        questionIds: createdQuestions.map((q) => q.id),
        numContexts,
      },
    })

    return redirect(`/dashboard/${deliberation.id}`)
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
  return json({})
}

export default function NewDeliberation() {
  const navigate = useNavigate()
  const [title, setTitle] = useState("")
  const [questions, setQuestions] = useState<string[]>([""])
  const [numContexts, setNumContexts] = useState("5")

  const actionData = useActionData<{ error?: string }>()

  useEffect(() => {
    if (actionData?.error) toast.error(actionData.error)
  }, [actionData])

  const updateQuestion = (i: number, v: string) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? v : q)))
  const addQuestion = () => setQuestions((qs) => [...qs, ""])
  const removeQuestion = (i: number) =>
    setQuestions((qs) => qs.filter((_, idx) => idx !== i))

  const validQuestions = questions.map((q) => q.trim()).filter(Boolean)
  const canSubmit = title.trim().length > 0 && validQuestions.length > 0

  return (
    <div className="w-full max-w-2xl mx-auto mt-6 sm:mt-12 px-2 sm:px-4">
      <h1 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight mb-3">
        Create new deliberation
      </h1>
      <p className="text-base text-muted-foreground mb-10 leading-relaxed">
        Give your deliberation a title and at least one question. We'll
        automatically surface the most morally distinct situations within each
        question. You can simulate participants from the dashboard once it's
        ready.
      </p>
      <Form method="post" className="space-y-8">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            className="mt-2"
            id="title"
            name="title"
            placeholder="eg. SF Homelessness"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <p className="text-sm text-muted-foreground mt-2">
            Just a short label for this deliberation.
          </p>
        </div>

        <div>
          <Label htmlFor="welcomeText">Welcome Text</Label>
          <Textarea
            className="mt-2"
            id="welcomeText"
            name="welcomeText"
            placeholder="Optional: shown to participants on the start page"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base">Questions</Label>
            <span className="text-xs text-muted-foreground">
              {validQuestions.length} question
              {validQuestions.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground -mt-1">
            Participants pick a question and have a conversation about it. Add
            more for richer coverage.
          </p>

          {questions.map((q, i) => (
            <div key={i} className="flex gap-2 items-start">
              <Textarea
                name="questions"
                placeholder={
                  i === 0
                    ? "eg. What should the SF government do about homelessness?"
                    : "Another question…"
                }
                value={q}
                onChange={(e) => updateQuestion(i, e.target.value)}
                rows={2}
                className="resize-none"
                required={i === 0}
              />
              {questions.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeQuestion(i)}
                  aria-label="Remove question"
                  className="mt-1 shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addQuestion}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" /> Add another question
          </Button>
        </div>

        <div className="w-full sm:w-1/2">
          <Label htmlFor="numContexts">Contexts per question</Label>
          <Select
            name="numContexts"
            value={numContexts}
            onValueChange={setNumContexts}
          >
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <SelectItem key={n} value={n.toString()}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground mt-2">
            How many distinct situations to surface within each question. The
            moral graph organizes upgrade stories by these.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row justify-between pt-4 gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
          >
            Cancel
          </Button>
          <LoadingButton type="submit" disabled={!canSubmit}>
            Create Deliberation
          </LoadingButton>
        </div>
      </Form>
    </div>
  )
}
