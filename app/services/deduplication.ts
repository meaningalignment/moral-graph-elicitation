import { CanonicalValuesCard, Context, ValuesCard } from "@prisma/client"
import { db, inngest } from "~/config.server"
import {
  deduplicateValues,
  getExistingDuplicateValue,
  getExistingDuplicateContext,
  getRepresentativeValue,
} from "values-tools"
import { embedCanonicalCard } from "./embedding"
import { embedValue } from "values-tools"

async function createCanonicalCard(
  valuesCard: ValuesCard
): Promise<CanonicalValuesCard> {
  // Create a canonical values card.
  const canonical = await db.canonicalValuesCard.create({
    data: {
      title: valuesCard.title,
      description: valuesCard.description,
      policies: valuesCard.policies,
      deliberationId: valuesCard.deliberationId,
    },
  })
  // Embed the canonical values card.
  await embedCanonicalCard(canonical as any)
  return canonical
}

export async function searchSimilarCards(
  deliberationId: number,
  embeddingArray: number[],
  limit: number = 10,
  minimumDistance: number = 0.1
): Promise<Array<CanonicalValuesCard & { _distance: number }>> {
  const query = `SELECT DISTINCT cvc.id, cvc.title, cvc."description", cvc."policies", cvc.embedding <=> '${JSON.stringify(
    embeddingArray
  )}'::vector as "_distance"
    FROM "CanonicalValuesCard" cvc
    WHERE cvc."deliberationId" = ${deliberationId} AND cvc.embedding IS NOT NULL
    ORDER BY "_distance" ASC
    LIMIT ${limit};`

  const result = await db.$queryRawUnsafe<
    Array<CanonicalValuesCard & { _distance: number }>
  >(query)

  return result.filter((r) => r._distance <= minimumDistance)
}

export async function searchSimilarContexts(
  deliberationId: number,
  embeddingArray: number[],
  limit: number = 10,
  minimumDistance: number = 0.5
): Promise<Array<Context & { _distance: number }>> {
  const query = `SELECT DISTINCT c.id, c."deliberationId", c.embedding <=> '${JSON.stringify(
    embeddingArray
  )}'::vector as "_distance"
    FROM "Context" c
    WHERE c."deliberationId" = ${deliberationId} AND c.embedding IS NOT NULL
    ORDER BY "_distance" ASC
    LIMIT ${limit};`

  const result = await db.$queryRawUnsafe<
    Array<Context & { _distance: number }>
  >(query)

  return result.filter((r) => r._distance <= minimumDistance)
}

async function fetchSimilarCanonicalCard(
  deliberationId: number,
  candidate: ValuesCard,
  limit: number = 5
): Promise<CanonicalValuesCard | null> {
  console.log(
    `Fetching similar canonical card, candidate: ${JSON.stringify(candidate)}`
  )

  // Embed the candidate.
  const cardEmbeddings = await embedValue(candidate)

  console.log("Got card embeddings, fetching canonical card.")

  // Fetch `limit` canonical cards for the case based on similarity.
  const canonical = await searchSimilarCards(
    deliberationId,
    cardEmbeddings,
    limit,
    0.1
  )

  console.log(`Got ${canonical.length} canonical cards`)

  // If we have no canonical cards, we can't deduplicate.
  if (canonical.length === 0) {
    console.log("No canonical cards found for candidate.")
    return null
  }

  // Use a prompt to see if any of the canonical cards are the same value
  return getExistingDuplicateValue<ValuesCard, CanonicalValuesCard>(
    candidate,
    canonical
  )
}

async function linkClusterToCanonicalCard(
  cluster: ValuesCard[],
  canonicalCard: CanonicalValuesCard
) {
  await db.valuesCard.updateMany({
    where: {
      id: { in: cluster.map((c) => c.id) },
    },
    data: { canonicalCardId: canonicalCard.id },
  })
}

async function fetchNonCanonicalizedValues(
  deliberationId: number,
  limit: number = 50
) {
  return (await db.valuesCard.findMany({
    where: {
      canonicalCardId: null,
      deliberationId: deliberationId,
    },
    take: limit,
  })) as ValuesCard[]
}

export async function fetchDuplicateContext(
  context: string,
  deliberationId: number
): Promise<string | null> {
  const contexts = await db.context.findMany({ where: { deliberationId } })
  return getExistingDuplicateContext(
    context,
    contexts.map((c) => c.id)
  )
}

// Cron function
export const deduplicateCron = inngest.createFunction(
  {
    id: "deduplicate-cron",
    concurrency: 1,
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step, logger }) => {
    logger.info("Running deduplication cron job.")

    // Get all deliberations
    const deliberations = await step.run(
      "Fetching all deliberations",
      async () => {
        return db.deliberation.findMany()
      }
    )

    for (const deliberation of deliberations) {
      // Trigger deduplication for each deliberation
      await step.sendEvent("deduplicate", {
        name: "deduplicate",
        data: { deliberationId: deliberation.id },
      })
    }

    return {
      message: "Triggered deduplication for all deliberations.",
    }
  }
)

// Deduplication function for a specific deliberation
export const deduplicate = inngest.createFunction(
  { id: "deduplicate", triggers: { event: "deduplicate" } },
  async ({ event, step, logger }) => {
    const deliberationId = event.data.deliberationId as number
    logger.info(`Running deduplication for deliberation ${deliberationId}.`)

    // Get all non-canonicalized submitted values cards for this deliberation.
    const cards = (await step.run(
      `Get non-canonicalized cards for deliberation ${deliberationId}`,
      async () => fetchNonCanonicalizedValues(deliberationId, 100)
    )) as any as ValuesCard[]

    if (cards.length === 0) {
      logger.info(`No cards to deduplicate for deliberation ${deliberationId}.`)
      // Always emit a finished event so any waiter (the simulation orchestrator)
      // doesn't hang for the full timeout.
      await step.sendEvent("deduplicate-finished", {
        name: "deduplicate-finished",
        data: { deliberationId },
      })
      return {
        message: `No cards to deduplicate for deliberation ${deliberationId}.`,
      }
    }

    // Cluster the non-canonicalized cards with a prompt / dbscan.
    const clusters = (await step.run(`Cluster cards using prompt`, async () => {
      const useDbScan = cards.length > 20 // Only use dbscan when we're dealing with a lot of cards.
      return deduplicateValues<ValuesCard>(cards, null, useDbScan) // @TODO: take context into account here.
    })) as any as ValuesCard[][]

    logger.info(
      `Found ${clusters.length} clusters for deliberation ${deliberationId}.`
    )

    //
    // For each deduplicated non-canonical card, find canonical cards that are essentially
    // the same value and link them.
    //
    // If no such cards exist, canonicalize the duplicated non-canonical card and link the cluster
    // to the new canonical card.
    //
    let i = 0
    for (const cluster of clusters) {
      logger.info(`Deduplicating cluster ${++i} of ${cluster.length} cards.`)

      const representative = (await step.run(
        "Get best values card from cluster",
        async () => getRepresentativeValue<ValuesCard>(cluster)
      )) as any as ValuesCard

      const existingCanonicalDuplicate = (await step.run(
        "Fetch canonical duplicate",
        async () => fetchSimilarCanonicalCard(deliberationId, representative)
      )) as any as CanonicalValuesCard | null

      if (existingCanonicalDuplicate) {
        await step.run("Link cluster to existing canonical card", async () =>
          linkClusterToCanonicalCard(cluster, existingCanonicalDuplicate)
        )
      } else {
        const newCanonicalDuplicate = (await step.run(
          "Canonicalize representative",
          async () => createCanonicalCard(representative)
        )) as any as CanonicalValuesCard

        await step.run(
          "Link cluster to newly created canonical card",
          async () => linkClusterToCanonicalCard(cluster, newCanonicalDuplicate)
        )
      }
    }

    logger.info(
      `Done. Deduplicated ${cards.length} cards for deliberation ${deliberationId}.`
    )

    await step.sendEvent("deduplicate-finished", {
      name: "deduplicate-finished",
      data: { deliberationId },
    })

    return {
      message: `Deduplicated ${cards.length} cards for deliberation ${deliberationId}.`,
    }
  }
)
