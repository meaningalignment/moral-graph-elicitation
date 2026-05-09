import { CanonicalValuesCard } from "@prisma/client"
import { SerializeFrom } from "@remix-run/node"
import { useNavigation, Form } from "@remix-run/react"
import { useRef, useState } from "react"
import { BackgroundTaskButton } from "./background-task-button"
import { Button } from "./ui/button"
import { IconSpinner } from "./ui/icons"
import { Label } from "./ui/label"
import ValuesCard from "./values-card"

export function ValuesCardEditor({
  card,
  cardType,
}: {
  card: SerializeFrom<CanonicalValuesCard>
  cardType: "canonical" | "personal"
}) {
  const [critique, setCritique] = useState<string | null>(null)
  const [titleIdeas, setTitleIdeas] = useState<string[] | null>(null)
  const nav = useNavigation()
  return (
    <div key={card.id}>
      <ValuesCard detailsInline card={card as any as CanonicalValuesCard} />
      <Form method="post" className="mt-8 w-full max-w-sm flex flex-col gap-4">
        <h1 className="font-serif text-3xl font-semibold tracking-tight my-8 text-center">Edit your card</h1>
        <input type="hidden" name="cardId" value={card.id!} />
        <input type="hidden" name="cardType" value={cardType} />
        <Label>
          <span className="text-foreground">Title</span>
          <input
            name="title"
            type="text"
            className="mt-1 block w-full rounded-md border-border shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 px-2 py-1.5 text-sm"
            defaultValue={card.title}
          />
        </Label>
        <div className="flex items-end justify-end -mt-2 gap-2">
          <BackgroundTaskButton
            task={{
              task: "generateTitles",
              policies: JSON.stringify(card.policies),
            }}
            onData={(result) => setTitleIdeas(result)}
          >
            Suggest
          </BackgroundTaskButton>
        </div>
        {titleIdeas ? (
          <div className="text-sm text-muted-foreground text-center">
            {titleIdeas}
          </div>
        ) : null}

        <Label>
          <span className="text-foreground">Instructions Short</span>
          <textarea
            rows={3}
            name="description"
            className="mt-1 block w-full rounded-md border-border shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 px-2 py-1.5 text-sm"
            defaultValue={card.description}
          />
        </Label>

        <Label>
          <span className="text-foreground">Evaluation Criteria</span>
          <textarea
            rows={15}
            name="policies"
            className="mt-1 block w-full rounded-md border-border shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 px-2 py-1.5 text-sm"
            defaultValue={JSON.stringify(card.policies, null, 2)}
          />
        </Label>
        <div className="flex items-end justify-end -mt-2 gap-2">
          <BackgroundTaskButton
            task={{
              task: "critiquepolicies",
              policies: JSON.stringify(card.policies),
            }}
            onData={(result) => setCritique(result)}
          >
            Critique
          </BackgroundTaskButton>
          {/* <Button> Improve </Button> */}
        </div>
        <div className="flex items-end justify-end gap-2">
          <BackgroundTaskButton
            task={{
              task: "reembed",
              cardId: card.id!.toString(),
            }}
            onData={() => alert("done!")}
          >
            Re-embed
          </BackgroundTaskButton>
          <Button className="mt-4" type="submit">
            {nav.state === "submitting" ? (
              <IconSpinner className="h-5 w-5 animate-spin mr-2" />
            ) : null}
            Save
          </Button>
        </div>
      </Form>
      {critique && (
        <div className="mt-8">
          <h1 className="font-serif text-3xl font-semibold tracking-tight my-8 text-center">Critique</h1>
          <pre className="text-sm text-muted-foreground whitespace-pre-wrap">
            {critique}
          </pre>
        </div>
      )}
    </div>
  )
}
