import { PrismaClient, Prisma } from "@prisma/client"
import { cowpunkify } from "cowpunk-auth"
import { Inngest } from "inngest"
import { OpenAI } from "openai"
import { redirect } from "@remix-run/node"
import { configureValuesTools, PromptCache } from "values-tools"

// values-tools defaults to Claude. Pin it to the project-wide model so
// there's a single knob and we don't silently require an ANTHROPIC_API_KEY.
configureValuesTools({
  defaultModel: process.env.VALUES_TOOLS_MODEL ?? "gpt-5",
  // gpt-5 only supports temperature=1; setting it here so values-tools'
  // genObj/genText don't get rejected.
  defaultTemperature: 1,
  cache: new PromptCache(),
})
import { Pool, neonConfig } from "@neondatabase/serverless"
import { PrismaNeon } from "@prisma/adapter-neon"
import ws from "ws"

/**
 * Build a Prisma client. When USE_NEON_HTTP_DRIVER is truthy we use Neon's
 * HTTPS/WS-based driver via @prisma/adapter-neon. This makes the app deployable
 * on edge runtimes and lets scripts run from environments where raw 5432/tcp is
 * blocked (CI sandboxes). Default keeps the original behaviour to avoid
 * regressing the running deployment.
 */
function makeDb(): PrismaClient {
  if (process.env.USE_NEON_HTTP_DRIVER === "true") {
    if (typeof WebSocket === "undefined") neonConfig.webSocketConstructor = ws
    // Route pool queries via fetch (HTTPS) instead of WebSocket. Required when
    // the runtime can talk HTTPS but not WS (some sandboxes / edge runtimes).
    neonConfig.poolQueryViaFetch = true
    const pool = new Pool({ connectionString: process.env.POSTGRES_URL })
    const adapter = new PrismaNeon(pool)
    return new PrismaClient({ adapter } as any)
  }
  return new PrismaClient()
}

export const db = makeDb()

export const auth = cowpunkify({
  site: "Moral Graph Elicitation",
  loginFrom: "Moral Graph Elicitation <info@meaningalignment.org>",
  users: db.user,
  emailCodes: db.emailCodes,
})

export async function ensureLoggedIn(request: Request, extraParams = {}) {
  const userId = (await auth.getUserId(request)) as number | undefined
  if (!userId) {
    const params = new URLSearchParams({
      redirect: request.url,
      ...extraParams,
    })
    throw redirect(`/auth/login?${params.toString()}`)
  } else {
    return userId
  }
}

export const inngest = new Inngest({
  id: process.env.INNGEST_NAME ?? "Moral Graph Elicitation",
  apiKey: process.env.INNGEST_API_KEY,
  eventKey: process.env.INNGEST_EVENT_KEY,
})

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY!,
  baseURL: "https://api.perplexity.ai",
})
