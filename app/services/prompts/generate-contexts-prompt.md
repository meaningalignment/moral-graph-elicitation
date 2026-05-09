You will be given a transcript of a chat, a user's value (a list of attention policies), and a list of existing contexts already in the deliberation. Your task is to figure out which contexts the value applies to.

# Strong bias toward REUSE

Existing contexts are passed in. Your default is to return an EMPTY list — meaning every factor of the user's situation is already covered by an existing context. Only emit a new context when the transcript surfaces a morally-relevant slice that no existing context covers. If unsure, do not emit it. New contexts should be rare.

A new context is only justified when:
- It picks out a different actor, stake, or moral tension than every existing one.
- The value would NOT be wise advice for any existing context, and IS wise advice for the new one.
- A reasonable person reading the existing list could not have placed the user's situation under any of them.

If two existing contexts both partially cover the situation, that is NOT a reason to add a third — pick the closer existing one and stay silent.

# Attention policies

A values card is made up of several attention policies. Attention policies list what a person pays attention to when they do a kind of discernment about how to act in a certain situation. They specify what is meaningful to pay attention to — that is, something constitutively good in the user's view — as opposed to instrumental to some other goal.

For example, when choosing a good way to act when "a democratic choice is being made", one could find it meaningful to pay attention to:

```
[
  "CHANGES in people when entrusted with the work of self-determination",
  "INSIGHTS that emerge through grappling with morally fraught questions",
  "CAPACITIES that develop when a person tries to be free and self-directed"
]
```

# Context format

Each context is a SHORT clause beginning with "When" — e.g. "When assisting a family facing eviction" or "When the person refuses services". Treat it as completing "What's wise to do ___?". Aim for 4-9 words. Never write a full sentence. Never include policy proposals or demographics that don't change the values needed.

## Good examples

- "When assisting a family facing eviction"
- "When the person refuses services"
- "When someone is medically fragile"
- "When residents fear an encampment near schools"
- "When a person wants to remain on the street"

## Bad examples (DO NOT do this)

- "A person with severe PTSD and fentanyl addiction repeatedly overdoses and has fluctuating decision-making capacity"  (too long, too clinical, full sentence)
- "Capacity constraints prevent timely access to stabilization, treatment, and housing."  (full sentence, policy framing)
- "A person is rebuilding stability through gradual, measurable habits."  (full sentence, doesn't start with "When")
- "The city must balance civil liberties and safety by applying CARE Court..."  (policy proposal, not a situation)
- "A 72-year-old woman on a fixed income..."  (a CV, not a situational frame)

# Output

Return a list of NEW "When ..." clauses — only those genuinely not covered by any existing context. An empty list is the expected default. Do NOT echo existing contexts.
