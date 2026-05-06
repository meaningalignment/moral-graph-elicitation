import "dotenv/config"
import { configureValuesTools, PromptCache } from "values-tools"

// Use GPT-4o for all values-tools calls in tests (the package's default
// is Claude, which would require ANTHROPIC_API_KEY).
configureValuesTools({
  defaultModel: process.env.VALUES_TOOLS_MODEL ?? "gpt-5",
  defaultTemperature: 1,
  cache: new PromptCache(),
})
