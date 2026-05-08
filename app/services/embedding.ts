import { CanonicalValuesCard, ValuesCard } from "@prisma/client"
import { db, inngest } from "~/config.server"
import { calculateAverageEmbedding } from "~/lib/utils"
import { embedText, embedValue } from "values-tools"

type EmbeddableCard = Pick<
  ValuesCard | CanonicalValuesCard,
  "id" | "title" | "description" | "policies" | "deliberationId"
>

export async function embedCanonicalCard(card: EmbeddableCard) {
  // Embed card.
  const embedding: number[] = await embedValue(card)

  // Update in DB.
  await db.$executeRaw`UPDATE "CanonicalValuesCard" SET embedding = ${JSON.stringify(
    embedding
  )}::vector WHERE id = ${card.id};`
}

export async function embedNonCanonicalCard(card: EmbeddableCard) {
  // Embed card.
  const embedding: number[] = await embedValue(card)

  // Update in DB.
  await db.$executeRaw`UPDATE "ValuesCard" SET embedding = ${JSON.stringify(
    embedding
  )}::vector WHERE id = ${card.id};`
}

async function getNonCanonicalCardsWithoutEmbedding(deliberationId: number) {
  return (await db.$queryRaw`
    SELECT id, title, "description", "policies" 
    FROM "ValuesCard" 
    WHERE "ValuesCard".embedding IS NULL 
    AND "deliberationId" = ${deliberationId}
  `) as ValuesCard[]
}

async function getCanonicalCardsWithoutEmbedding(deliberationId: number) {
  return (await db.$queryRaw`
    SELECT id, title, "description", "policies", "isArchived", embedding::text 
    FROM "CanonicalValuesCard" 
    WHERE "CanonicalValuesCard".embedding IS NULL 
    AND "isArchived" = false
    AND "deliberationId" = ${deliberationId}
  `) as CanonicalValuesCard[]
}

export async function getCanonicalCardsWithEmbedding(deliberationId: number) {
  return (
    await db.$queryRaw<Array<any>>`
    SELECT "id", "title", "description", "policies", "deliberationId", "createdAt", "updatedAt", "isArchived", "embedding"::text as embedding
    FROM "CanonicalValuesCard"
    WHERE "CanonicalValuesCard".embedding IS NOT NULL 
    AND "isArchived" = false
    AND "deliberationId" = ${deliberationId};`
  ).map((d) => ({
    ...d,
    embedding: JSON.parse(d.embedding).map((v: any) => parseFloat(v)),
  })) as (CanonicalValuesCard & { embedding: number[] })[]
}

export async function getContextEmbedding(
  contextId: string
): Promise<number[]> {
  const embedding = (
    await db.$queryRaw<{
      embedding: any
    }>`SELECT embedding::text FROM "Context" WHERE id = ${contextId} LIMIT 1;`
  ).embedding

  if (!embedding) {
    return await embedContext(contextId)
  }

  return JSON.parse(embedding).map((v: any) => parseFloat(v))
}

export async function getUserEmbedding(userId: number): Promise<number[]> {
  try {
    const userEmbeddings: Array<Array<number>> = (
      await db.$queryRaw<
        Array<{ embedding: any }>
      >`SELECT embedding::text FROM "ValuesCard" vc INNER JOIN "Chat" c  ON vc."chatId" = c."id" WHERE c."userId" = ${userId} AND vc."embedding" IS NOT NULL`
    ).map((r) => JSON.parse(r.embedding).map((v: any) => parseFloat(v)))

    console.log(`Got embedding vector for user ${userId}. Calculating average.`)

    return calculateAverageEmbedding(userEmbeddings)
  } catch (e) {
    console.error(e)
    return new Array(1536).fill(0)
  }
}

export async function embedContext(contextId: string): Promise<number[]> {
  // Embed context.
  const embedding: number[] = await embedText(contextId)

  // Update in DB.
  await db.$executeRaw`UPDATE "Context" SET embedding = ${JSON.stringify(
    embedding
  )}::vector WHERE id = ${contextId};`

  return embedding
}

//
// Ingest functions for embeddings.
//

export const embedCards = inngest.createFunction(
  { id: "Embed cards", triggers: { event: "embed-cards" } },
  async ({ event, step, logger }) => {
    const deliberationId = Number(event.data.deliberationId)
    const cardType = (event.data.cardType ?? "all") as
      | "all"
      | "canonical"
      | "non-canonical"

    // Embed canonical cards.
    if (cardType === "all" || cardType === "canonical") {
      const deduplicatedCards = await step.run(
        "Fetching deduplicated cards",
        async () => getCanonicalCardsWithoutEmbedding(deliberationId)
      )

      for (const card of deduplicatedCards) {
        await step.run("Embed deduplocated card", async () => {
          await embedCanonicalCard(
            card as Omit<CanonicalValuesCard, "createdAt" | "updatedAt">
          )
        })
      }

      logger.info(`Embedded ${deduplicatedCards.length} canonical cards.`)
    }

    // Embed non-canonical cards.
    if (cardType === "all" || cardType === "non-canonical") {
      const nonCanonicalCards = await step.run(
        "Fetching canonical cards",
        async () => getNonCanonicalCardsWithoutEmbedding(deliberationId)
      )

      for (const card of nonCanonicalCards) {
        await step.run("Embed non-canonical card", async () => {
          await embedNonCanonicalCard(card)
        })
      }

      logger.info(`Embedded ${nonCanonicalCards.length} canonical cards.`)
    }

    await step.sendEvent("embed-cards-finished", {
      name: "embed-cards-finished",
      data: { deliberationId },
    })
    return { message: `Embedded cards.` }
  }
)

export const embedContexts = inngest.createFunction(
  { id: "embed-contexts", triggers: { event: "embed-contexts" } },
  async ({ event, step, logger }) => {
    const deliberationId = Number(event.data.deliberationId)

    const contextsToEmbed = await step.run(
      "Fetching contexts without embeddings",
      async () => db.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "Context" 
          WHERE embedding IS NULL
          AND "deliberationId" = ${deliberationId};`
    )

    for (const context of contextsToEmbed) {
      await step.run(`Embed context ${context.id}`, async () =>
        embedContext(context.id)
      )
    }

    logger.info(`Embedded ${contextsToEmbed.length} contexts`)

    await step.sendEvent("embed-contexts-finished", {
      name: "embed-contexts-finished",
      data: event.data,
    })
    return { message: `Embedded ${contextsToEmbed.length} contexts` }
  }
)
