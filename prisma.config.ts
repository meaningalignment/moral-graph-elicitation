import "dotenv/config"
import { defineConfig } from "@prisma/config"
import path from "node:path"

/**
 * Prisma 7 moved connection URLs out of `schema.prisma` into this file.
 * Runtime DB access goes through `@prisma/adapter-neon` (configured in
 * `app/config.server.ts`) — the URLs here are only used by the Prisma CLI
 * for migrations / introspection / `prisma generate`.
 */
export default defineConfig({
  schema: path.join("schema.prisma"),
  datasource: {
    url: process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL,
    shadowDatabaseUrl: process.env.POSTGRES_URL_NON_POOLING_SHADOW,
  },
  experimental: {
    extensions: true,
  },
})
