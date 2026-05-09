import { json } from "@remix-run/node"
import { db } from "../config.server"
import { genText } from "values-tools"

export const definitionOfASourceOfMeaning = `
A "source of meaning" is a concept similar to a value – it is a way of living that is important to you. Something that you pay attention to in a choice. They are more specific than words like "honesty" or "authenticity". They specify a particular *kind* of honesty and authenticity, specified as a path of attention.

A source of meaning is distinct from similar concepts:
- A source of meaning is not a goal. A goal is something you want to achieve, like "become a doctor" or "get married". A source of meaning is a way of living, like "be a good friend" or "be a good listener".
- A source of meaning is not a moral principle. A source of meaning is not a rule that you think everyone should follow. It is a way of living that is important to a person, but not necessarily to others.
- A source of meaning is not a norm or a social expectation. A source of meaning is not something you do because you feel like you have to, or because you feel like you should. It is something the user does because it is intrinsically important to them.
- A source of meaning is not an internalized norm – a norm the user has adopted outside of the original social context. It is a way of living that produces a sense of meaning for you, not a way of living that you think is "right" or "correct".`

export const attentionPoliciesCriteria = `
- **Gather details, so policies aren't vague or abstract.** Collect precise, but general, instructions that almost anyone could see how to follow with their attention. Don't say "LOVE and OPENNESS which emerges" (too abstract). Instead, say "FEELINGS in my chest that indicate..." or "MOMENTS where a new kind of relating opens up". Ask the user questions, until you can achieve this specificity.
- **Ensure the policies make clear what's meaningful.** A person should be able to see how attending to the thing could produce a sense of meaning. Otherwise, specify more.
- **Make sure they fit together.** The policies should fit together to form a coherent whole. They should not be unrelated, but should work together.
-. **Start with plural noun phrases.** Policies should start with a capitalized phrase that's the kind of thing to attend to ("MOMENTS", "SENSATIONS", "CHOICES", etc), followed by a qualifier phrase that provides detail on which type of that thing it's meaningful to attend to.
- **Write from the perspective of the actor.** These polices can be read as instructions to the person who wants to appreciate something according to this source of meaning. ("SENSATIONS that point to misgivings I have about the current path").
- **Use general words.** For instance, prefer "strangers" to "customers" when either would work. Prefer "objects" to "trees".
- **Be precise.** Remove vague or abstract language. Don't use the word "meaningful" itself, or synonyms like "deep". Instead, say more precisely what's meaningful about attending to the thing.
`

export const valuesCardCriteria = `
1. **Be coherent.** The things to attend to should fit together to form a coherent whole. They should not be contradictory or unrelated. All elements of the source of meaning should be required, and work together, in the context.
2. **Use noun phrases.** List things that can be attended to directly, not broader actions, processes, or virtues. The attentional policies should each be written in the order "<plural form of thing to attend to> that <qualifier>, so as to <reason it's meaningful to attend to it>".
3. **Be clear and specific.** Simply instructing someone to attend to these things should be enough to show them this source of meaning. Avoid instructions that are vague, abstract, or difficult to understand. Be as specific as possible.
4. **No poetry.** No items should use the word "meaningful" itself (or synonyms like "deep"). Replace it with something that implies what exactly is meaningful about attending to the thing. In general, remove poetic or abstract language.
5. **Write from the perspective of the actor.** The instructions should be written from the perspective of the person who exhibits the source of meaning, not from the perspective of an outside observer.
6. **Say what's meaningful.** A person should be able to sense why each item could be meaningful within the context. They should be able to see how attending to the thing could produce a sense of meaning. Otherwise, add information.
7. **No goals.** Attending to these things should be broadly beneficial, leading to many outcomes. The journey itself should be part of the good life for the person with the source of meaning, rather than being instrumental. They should be things that can be attended to in a choice, not things that are the result of a choice.
8. **State things positively.** They should be things a person COULD attend to, not things to avoid attending to.
9. **Use clear, simple language.** Anyone in the relevant context should be able to see what you mean about what to attend to. Theinstructions should be clear enough that you could use them in a survey to see whether or not someone was attending to those things.
10. **Use general words.** For instance, prefer "strangers" to "customers" if either would work.
`

async function critiqueValuesCard(policies: string[]) {
  return await genText({
    prompt: critiquePrompt,
    userMessage: policies.join("\n"),
  })
}

async function generateTitles(policies: string[]) {
  return await genText({
    prompt: titlesPrompt,
    userMessage: policies.join("\n"),
  })
}

export async function updateCardFromForm(formData: FormData) {
  const cardId = Number(formData.get("cardId"))
  const cardType = formData.get("cardType") as string
  const title = formData.get("title") as string
  const description = formData.get("description") as string
  const policies = JSON.parse((formData.get("policies") as string) || "[]")
  const data = { title, description, policies }
  if (cardType === "canonical") {
    await db.canonicalValuesCard.update({ where: { id: cardId }, data })
  } else if (cardType === "personal") {
    await db.valuesCard.update({ where: { id: cardId }, data })
  } else {
    throw new Error("Unknown card type")
  }
}

export async function runTaskFromForm(formData: FormData) {
  const task = formData.get("task") as string
  const policies = JSON.parse((formData.get("policies") as string) || "[]")
  if (task === "critiquepolicies") {
    const result = await critiqueValuesCard(policies)
    return json(result)
  } else if (task === "generateTitles") {
    const result = await generateTitles(policies)
    return json(result)
  } else {
    return json({ error: "Unknown task" }, { status: 400 })
  }
}

const titlesPrompt = `I'll submit a list of attentional policies, meant to fit together to represent a "source of meaning".

Answer first: what kind of meaning might a person experience, when they attend to these things?

Then, suggest 10 potential titles for this source of meaning, like the examples below.

# Here are some examples of attentional policies and titles

1. Title: "Diverse Perspectives"

DIVERSITY of perspectives that exist within the population
INSIGHTS from different individuals who have thought about similar questions
ANGLES that the person may not have considered
CLARITY that emerges from understanding diverse viewpoints

2. Title: "Golden Retriever"

WHATEVER I'm excited about this week
MOMENTS of full commitment and enthusiasm towards new experiences
INSTANCES where I let go of hesitation, and fully engage in an activity or pursuit
ACTIONS I take in the fearless pursuit of my interests
ACHIEVEMENTS and BREAKTHROUGHS on the way to my dreams
EXPERIENCES of joy that start from within and bubble outward

3. Title: "Rapid Discernment"

AWARENESS of my gut feelings and instincts, such that I can trust them
MOMENTS where someone tries to impose their perspective or interpretation of events, and I keep them in their place
COMFORT in taking immediate and decisive action, guided by intuition, without doubt or hesitation
CONFIDENCE in my own judgment and decision-making abilities
MOMENTS of calm and clarity when intuition speaks louder than external noise
APPRECIATION for the inherent wisdom of my body and intuition
INSTANCES of successfully navigating complex situations by relying on intuition

4. Title: "Mama Bear"

ACTIONS to take that will get people dancing, open them up, etc
UNIQUE MOMENTS of social cohesion and expression
THOUGHTS and IDEAS that can be shared, to grow a relationship and learn from each other
GENUINE ENTHUSIASM when greeting people, to discover their depths
CURIOSITIES about the people around me
POSSIBILITIES for little walks or adventures with someone I'm curious about

# Definition of a source of meaning

${definitionOfASourceOfMeaning}
`

const regenPrompt = `I'll send a list of things that a person might attend to when following a value of theirs.

Please summarize these things by making a sentence. The sentence should look like "I attend to Xs, Ys, Zs, that together Q".

Xs, Ys, and Zs should be plural forms of the noun phrases that start each item in the list I send. Shorten them if possible, omitting most qualifiers, but qualifying completely abstract words like "moments".

Q should be your best idea about what kind of meaning a person might experience when they attend to these things.

Return only the summary sentence.
`

const critiquePrompt = `I'll submit a list of attentional policies, meant to fit together to represent a "source of meaning".

Your response should have five parts:
* First, say whether they fit together to define a source of meaning.
* Take any items where you're unsure what they mean, and write a guess about what someone might mean is meaningful to attend to.
* List any additional things that a person who attends to these items would also probably find it meaningful to attend to, as part of the same source of meaning.
* Then, use the criteria below to mention any problems with the list. Be as sensitive as you can.
* Finally, suggest a list with all problems fixed. Do not remove any items from the list, but you can split one item into two, or change the wording of an item, or add new items.

# Definition of a source of meaning

${definitionOfASourceOfMeaning}

# Criteria for attention policies

${attentionPoliciesCriteria}

# Example

Here is an example of a submitted list of attentional policies, and an improved version:

## Original

MOMENTS of clear decision-making that lead to deeper, more meaningful interaction
SHIFT from disorientation to delight as a sign of growth and deeper understanding
SENSE of groundedness and confidence in oneself, independent of external validation
DISCOVERY of unanticipated options and possibilities as a result of the clarity and perspective gained from grounded confidence
ABILITY to appraise the other person truthfully when grounded
CAPACITY to engage more freely and playfully with each other
FREEDOM and safety that comes from not needing constant reassurance from each other

## Improved

SENSE of groundedness and self-confidence, independent of external validation
MOMENTS of decision-making that open up new possibilities for interaction
SHIFTS from disorientation to delight because we are each willing to disorient the other
NEW WAYS OF INTERACTING that emerge from personal clarity and confidence
ABILITY to see the other person clearly and truthfully, without the need for reassurance
CAPACITY to engage more freely and playfully with each other
FEELINGS of freedom and safety that come from independence and self-assuredness
`
