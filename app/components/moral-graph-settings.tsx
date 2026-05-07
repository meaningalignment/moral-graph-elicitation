import { useState } from "react"
import { Button } from "~/components/ui/button"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { Checkbox } from "~/components/ui/checkbox"

export type GraphSettings = {
  questions: { id: number; title: string; question: string }[]
  questionId: number | null
  contextId: string | null
  visualizeEdgeCertainty: boolean
  visualizeWisdomScore: boolean
}

export const defaultGraphSettings: GraphSettings = {
  questions: [],
  questionId: null,
  contextId: null,
  visualizeEdgeCertainty: true,
  visualizeWisdomScore: true,
}

export default function MoralGraphSettings({
  initialSettings,
  onUpdateSettings,
  contexts,
}: {
  initialSettings: GraphSettings
  onUpdateSettings: (newSettings: GraphSettings) => void
  contexts: { id: string }[]
}) {
  const [settings, setSettings] = useState<GraphSettings>(initialSettings)
  const selectedQuestion = settings.questions?.find(
    (q) => q.id === settings.questionId
  )

  return (
    <div className="flex h-full flex-col overflow-y-auto border-l-2 bg-card px-6 py-8">
      <h2 className="text-lg font-bold mb-6">Graph Settings</h2>

      {/* Question Dropdown - Only show if there are multiple questions */}
      {settings.questions.length > 1 && (
        <div className="mb-2">
          <Label htmlFor="question">Question</Label>
          <Select
            onValueChange={(value: any) => {
              setSettings({
                ...settings,
                questionId: value !== "all" ? Number(value) : null,
              })
            }}
          >
            <SelectTrigger id="question">
              <SelectValue
                placeholder={selectedQuestion?.title ?? "All Questions"}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Questions</SelectItem>
              {settings.questions.map((q) => (
                <SelectItem key={q.id} value={q.id.toString()}>
                  {q.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Context Dropdown */}
      <div className="mb-4">
        <Label htmlFor="context">Context</Label>
        <Select
          value={settings.contextId ?? "all"}
          onValueChange={(value: string) => {
            setSettings({
              ...settings,
              contextId: value !== "all" ? value : null,
            })
          }}
        >
          <SelectTrigger id="context">
            <SelectValue placeholder="All Contexts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Contexts</SelectItem>
            {contexts.map((context: any) => (
              <SelectItem key={context.id} value={context.id}>
                {context.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {settings.questionId ? (
        <p className="text-xs text-muted-foreground mb-4">
          Showing values articulated when users were asked:
          <br />
          <br />
          <span className="text-sm text-black italic">
            {selectedQuestion!.question}
          </span>
        </p>
      ) : settings.questions.length === 1 ? (
        <p className="text-xs text-muted-foreground mb-4">
          Showing values articulated when users were asked:
          <br />
          <br />
          <span className="text-sm text-black italic">
            {settings.questions[0].question}
          </span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground mb-4">
          Show values for all questions.
        </p>
      )}

      {/* Checkboxes */}
      <div className="flex items-center space-x-2 mb-2 mt-4">
        <Checkbox
          id="edge"
          checked={settings.visualizeEdgeCertainty}
          onCheckedChange={(c: any) => {
            setSettings({ ...settings, visualizeEdgeCertainty: c })
          }}
        />
        <label
          htmlFor="edge"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Visualize Edge Certainty
        </label>
      </div>
      <p className="text-xs text-muted-foreground mb-6">
        Edge certainty is the likelihood participants agree on a wisdom upgrade.
        Visualized as the thickness of the edges.
      </p>

      <div className="flex items-center space-x-2 mb-2">
        <Checkbox
          id="node"
          checked={settings.visualizeWisdomScore}
          onCheckedChange={(c: any) => {
            setSettings({ ...settings, visualizeWisdomScore: c })
          }}
        />
        <label
          htmlFor="node"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Visualize Wisdom Score
        </label>
      </div>
      <p className="text-xs text-muted-foreground mb-6">
        The wisdom score for a value is the sum of the certainty of all incoming
        edges. Visualized as the blueness of the nodes.
      </p>

      <Button
        disabled={initialSettings === settings}
        className="mt-4"
        onClick={() => {
          onUpdateSettings(settings)
        }}
      >
        Update Graph
      </Button>
      <div className="flex-grow h-full" />
      <div className="flex flex-row-reverse">
        <a href="https://meaningalignment.org" className="text-xs underline">
          Learn More
        </a>
      </div>
    </div>
  )
}
