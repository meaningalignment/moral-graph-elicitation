import { isAllUppercase } from "~/lib/utils"
import React from "react"

export type ValuesCardData = {
  title: string
  description: string
  policies: string[]
  story?: string
}

type Props = {
  card: ValuesCardData
  header?: React.ReactNode
  tiled?: boolean
  detailsInline?: boolean
  editButton?: React.ReactNode
}

function DetailsList({ card }: { card: ValuesCardData }) {
  return (
    <div className="flex flex-col overflow-auto gap-y-1">
      {card.policies?.map((criterion, id) => (
        <li key={id} className="text-sm text-muted-foreground list-none">
          {criterion.split(" ").map((word, index) => (
            <React.Fragment key={`${id}/${index}`}>
              {isAllUppercase(word) ? (
                <strong className="font-semibold text-foreground">{word}</strong>
              ) : (
                word
              )}
              {index < criterion.split(" ").length - 1 ? " " : null}
            </React.Fragment>
          ))}
        </li>
      ))}
    </div>
  )
}

export default function ValuesCard({ card, header, editButton }: Props) {
  return (
    <div className="border border-border rounded-xl px-6 sm:px-8 pt-6 sm:pt-8 pb-6 w-full max-w-sm h-full bg-card flex flex-col">
      {header && header}
      {editButton ? (
        <div className="flex flex-row justify-between items-center gap-2">
          <p className="font-serif text-lg font-semibold leading-tight tracking-tight">
            {card.title}
          </p>
          {editButton}
        </div>
      ) : (
        <p className="font-serif text-lg font-semibold leading-tight tracking-tight">
          {card.title}
        </p>
      )}
      <p className="mt-1 text-md text-muted-foreground">{card.description}</p>
      <div className="px-4 py-3 -mx-2 sm:-mx-4 mt-4 place-self-stretch bg-secondary rounded-md">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
          Where my attention goes
        </p>
        <DetailsList card={card} />
      </div>
    </div>
  )
}
