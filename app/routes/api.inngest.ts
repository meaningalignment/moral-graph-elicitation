import { serve } from "inngest/remix"
import { deduplicateCron, deduplicate } from "~/services/deduplication"
import { embedCards, embedContexts } from "~/services/embedding"
import { inngest } from "~/config.server"
import { hypothesize, hypothesizeCron } from "~/services/hypothesis-generation"
import {
  generateSeedQuestionsAndContexts,
  generateSeedQuestions,
  generateSeedContexts,
  generateSeedGraph,
} from "~/services/generation"
import { findNewContexts } from "~/services/contexts"
import { simulateDeliberation } from "~/services/simulation"

const handler = serve({
  client: inngest,
  functions: [
    embedCards,
    embedContexts,
    hypothesize,
    hypothesizeCron,
    deduplicate,
    deduplicateCron,
    generateSeedQuestionsAndContexts,
    generateSeedQuestions,
    generateSeedContexts,
    generateSeedGraph,
    findNewContexts,
    simulateDeliberation,
  ],
})

export const config = {
  maxDuration: 300,
}

export { handler as loader, handler as action }
