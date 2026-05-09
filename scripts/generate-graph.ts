import { type Value } from "../app/lib/values-tools"
import {
  generateContextsFromQuestion,
  generateQuestions,
} from "../app/services/generation"
import {
  generateUpgrades,
  generateValueFromContext,
} from "../app/lib/values-tools"
import fs from "fs/promises"

type Upgrade = {
  fromId: number
  toId: number
  context: string
}

export async function generateGraph(
  topic: string,
  numQuestions: number = 5,
  numContexts: number = 5
) {
  console.log(`Starting graph generation for topic: ${topic}`)
  const values: Value[] = []
  const upgrades: Upgrade[] = []

  let valueIdCounter = 1
  let questionIdCounter = 1

  // 1. generate questions
  console.log(`Generating ${numQuestions} questions...`)
  const questions = await generateQuestions(topic, numQuestions).then((qs) =>
    qs.map((q) => ({ ...q, id: questionIdCounter++ }))
  )
  console.log(`Generated questions:`, questions)

  for (const question of questions) {
    console.log(`Processing question: ${question.question}`)
    // 2. generate contexts for each question
    console.log(`Generating ${numContexts} contexts...`)
    const contexts = await generateContextsFromQuestion(
      question.question,
      numContexts
    )
    console.log(`Generated contexts:`, contexts)

    // 3. Generate values for each context
    console.log(`Generating values for each context...`)
    const newValues = await Promise.all(
      contexts.map((context) =>
        generateValueFromContext(question.question, context, {
          includeStory: true,
          includeTitle: true,
        }).then((data: any) => ({
          id: valueIdCounter++,
          title: (data as any).title,
          description: (data as any).fictionalStory,
          policies: data.revisedAttentionPolicies,
          questionId: question.id,
          contexts,
          context,
        }))
      )
    )
    console.log(`Generated ${newValues.length} new values`)
    values.push(...newValues)

    // 4. generate hypotheses for contexts
    console.log(`Generating upgrades...`)
    const newUpgrades = await generateUpgrades(newValues)
    console.log(`Generated ${newUpgrades.length} new upgrades`)
    upgrades.push(
      ...newUpgrades.map((data) => ({
        fromId: data.a_id,
        toId: data.b_id,
        context:
          newValues.find((v) => v.id === data.a_id)?.context ||
          newValues[0].context,
      }))
    )
  }

  console.log(`Total values generated: ${values.length}`)
  console.log(`Total upgrades generated: ${upgrades.length}`)

  // Save graph to json file using fs
  const filename = `./app/lib/graph.json`
  console.log(`Saving graph to ${filename}...`)
  await fs.writeFile(
    filename,
    JSON.stringify({ values, upgrades, questions }, null, 2)
  )
  console.log(`Graph saved successfully`)
}

const topic = "How should the SF government treat homeless people?"
generateGraph(topic, 2, 3)
