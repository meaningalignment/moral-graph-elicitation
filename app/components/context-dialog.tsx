import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog"
import { Button } from "./ui/button"
import { contextDisplayName } from "~/lib/utils"

export default function ContextDialog({
  open,
  onClose,
  contextId,
  question,
}: {
  open: boolean
  onClose: () => void
  contextId: string
  question: string
}) {
  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm animate-fade-in">
        <DialogHeader></DialogHeader>
        <DialogTitle className="font-serif text-2xl font-semibold tracking-tight">
          {contextDisplayName(contextId)}
        </DialogTitle>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Context for question:
              </p>
              <div className="rounded-md bg-muted/50 border px-3 py-2">
                <p className="text-sm text-muted-foreground">{question}</p>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-lg font-semibold">What is this?</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm">
              Often when we disagree about values, we're actually disagreeing
              about the specific situations in which those values apply.
            </p>
            <p className="text-sm">
              For example, two people might disagree about immigration policies
              in general, but agree on how to handle the case of an immigrant
              who's lived in the country for 20 years.
            </p>
            {/* <p className="text-sm">
              Value contexts are generated continuously in the background.
              Interventions for the contexts with the most corresponding votes
              are shown below.
            </p> */}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
