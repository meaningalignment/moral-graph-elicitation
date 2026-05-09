import { installGlobals } from "@remix-run/node"

// vite.config.ts only runs at build/dev time, so its installGlobals call does
// not reach the deployed Vercel function. Without this runtime call, Remix's
// default `@remix-run/web-fetch` polyfill stays installed and Response.body is
// a web-streams-polyfill ReadableStream — pipeThrough'ing it with a native
// TextDecoderStream (what ai@6 does for SSE) throws "First parameter has
// member 'readable' that is not a ReadableStream" and breaks streamText in
// /api/chat-assistant.
installGlobals({ nativeFetch: true })

import { PrismaClient, Prisma } from "@prisma/client"
import { cowpunkify } from "cowpunk-auth"
import { Inngest } from "inngest"
import { OpenAI } from "openai"
import { redirect } from "@remix-run/node"
import { neonConfig } from "@neondatabase/serverless"
import { PrismaNeon } from "@prisma/adapter-neon"
import ws from "ws"

/**
 * Prisma 7 made driver adapters mandatory and stable; we always go through
 * the Neon adapter now. The opt-in fetch transport (USE_NEON_HTTP_DRIVER)
 * stays so scripts in sandboxes that block raw 5432/tcp can still run.
 */
if (typeof WebSocket === "undefined") neonConfig.webSocketConstructor = ws
if (process.env.USE_NEON_HTTP_DRIVER === "true") {
  neonConfig.poolQueryViaFetch = true
}

const adapter = new PrismaNeon({
  connectionString: process.env.POSTGRES_URL!,
})
export const db = new PrismaClient({ adapter })

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

// Inngest 4: default mode flipped to "cloud". Mark dev whenever NODE_ENV is
// not "production" so `bun run dev` works against the local Inngest dev
// server even when an INNGEST_EVENT_KEY is present in .env. Set
// INNGEST_DEV=0 to force cloud mode locally if you ever need it.
export const inngest = new Inngest({
  id: process.env.INNGEST_NAME ?? "Moral Graph Elicitation",
  apiKey: process.env.INNGEST_API_KEY,
  eventKey: process.env.INNGEST_EVENT_KEY,
  isDev:
    process.env.INNGEST_DEV === "1" ||
    (process.env.INNGEST_DEV !== "0" &&
      process.env.NODE_ENV !== "production"),
})

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY!,
  baseURL: "https://api.perplexity.ai",
})
