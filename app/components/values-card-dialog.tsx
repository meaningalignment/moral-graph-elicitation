import { useState } from "react"
import { Badge } from "./ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog"
import { ChevronUp, ChevronDown } from "lucide-react"
import React from "react"
import { contextDisplayName, isAllUppercase } from "~/lib/utils"
import { Button } from "./ui/button"

export default function ValuesCardDialog({
  open,
  onClose,
  value,
  links,
  onLinkClicked,
}: {
  open: boolean
  onClose: () => void
  value: any | null
  links?: any[]
  onLinkClicked?: (link: any) => void
}) {
  const [showPolicies, setShowPolicies] = useState(false)

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md animate-fade-in">
        {value && (
          <div key={value.id} className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge
                variant={value.isWinningValue ? "default" : "secondary"}
                className="cursor-default"
              >
                PageRank Score: {value.pageRank?.toFixed(2)}
              </Badge>
            </div>

            {links && links.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-muted-foreground mb-2 mt-4">
                  Voted as wise when:
                </p>
                <div className="flex flex-wrap gap-2">
                  {Array.from(
                    new Set(links.map((link) => link.contexts[0]))
                  ).map((context, index) => (
                    <Badge
                      key={index}
                      variant="outline"
                      className="cursor-pointer hover:bg-muted rounded-sm"
                      onClick={() =>
                        onLinkClicked?.(
                          links.find((link) => link.contexts[0] === context)
                        )
                      }
                    >
                      {contextDisplayName(context)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <h3 className="text-md font-bold mb-2 mt-8">{value.title}</h3>
            <p className="text-md text-muted-foreground mb-4">{value.description}</p>

            {value.policies && value.policies.length > 0 && (
              <div className="mt-4 hidden sm:block">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="w-full flex justify-between items-center p-2 hover:bg-muted"
                    onClick={() => setShowPolicies(!showPolicies)}
                  >
                    <span className="text-sm font-semibold text-muted-foreground">
                      Where to pay attention
                    </span>
                    {showPolicies ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="p-2 w-9">
                        ?
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px] animate-fade-in">
                      <DialogHeader>
                        <DialogTitle>Attention Policies</DialogTitle>
                      </DialogHeader>
                      <p className="text-sm text-muted-foreground">
                        Our process aims to elicit what participants think is
                        "good", beyond ideology, politics, and norms. We do this
                        by asking participants in a deliberation to articulate
                        how they themselves, or someone they respect, act in
                        situations similar to the question.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        We then ask what they (or that respected person) pay
                        attention to, and filter out things that they pay
                        attention to because of instrumental concerns, as
                        opposed to things they pay attention to because paying
                        attention to them is constitutive of a way of life that
                        is intrinsically meaningful.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        The idea is that good policy should support the good way
                        of life described by the wisest values of a population.
                      </p>

                      <p className="text-sm text-muted-foreground">
                        For more, see our paper{" "}
                        <a
                          href="https://arxiv.org/abs/2404.10636"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline underline-offset-4"
                        >
                          here
                        </a>
                        .
                      </p>
                    </DialogContent>
                  </Dialog>
                </div>

                {showPolicies && (
                  <div className="bg-secondary rounded-md p-2 mt-2">
                    <div className="space-y-0.5">
                      {(value.policies as string[]).map((policy, idx) => (
                        <p key={idx} className="text-xs text-muted-foreground">
                          {policy.split(" ").map((word, wordIdx) => (
                            <React.Fragment key={wordIdx}>
                              {isAllUppercase(word) ? (
                                <strong className="font-semibold text-muted-foreground">
                                  {word}
                                </strong>
                              ) : (
                                word
                              )}
                              {wordIdx < policy.split(" ").length - 1
                                ? " "
                                : null}
                            </React.Fragment>
                          ))}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
