import { CanonicalValuesCard, ValuesCard } from "@prisma/client"
import { db, inngest } from "~/config.server"
import {
  partitionValues,
  findCanonicalDuplicate,
  CardLike,
} from "./deduplication/prompt-dedup"
import { findDuplicateContext as findDuplicateContextPrompt } from "./contexts"

async function fetchNonCanonicalizedValues(
  deliberationId: number,
  limit: number = 100
): Promise<ValuesCard[]> {
  return db.valuesCard.findMany({
    where: { canonicalCardId: null, deliberationId },
    take: limit,
  })
}

async function fetchCanonicals(
  deliberationId: number
): Promise<CanonicalValuesCard[]> {
  return db.canonicalValuesCard.findMany({
    where: { deliberationId, isArchived: false },
  })
}

// Narrow type so callers can pass either Prisma rows or Inngest's JsonifyObject<row>.
function toCardLike(c: {
  id: number
  title: string
  description: string
  policies: string[]
}): CardLike {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    policies: c.policies,
  }
}

/**
 * Pre-link safety net: the unique constraint @@unique([title, description, policies])
 * on CanonicalValuesCard fires when seed-card or repeated runs produce a
 * representative whose shape is byte-identical to an existing canonical.
 * Look it up first instead of hitting a hard UCV inside the dedup step.
 */
async function createOrFetchCanonicalCard(
  rep: ValuesCard
): Promise<CanonicalValuesCard> {
  const existing = await db.canonicalValuesCard.findFirst({
    where: {
      deliberationId: rep.deliberationId,
      title: rep.title,
      description: rep.description,
      policies: { equals: rep.policies },
    },
  })
  if (existing) return existing
  return db.canonicalValuesCard.create({
    data: {
      title: rep.title,
      description: rep.description,
      policies: rep.policies,
      deliberationId: rep.deliberationId,
    },
  })
}

async function linkClusterToCanonicalCard(
  cluster: ValuesCard[],
  canonicalCard: CanonicalValuesCard
) {
  await db.valuesCard.updateMany({
    where: { id: { in: cluster.map((c) => c.id) } },
    data: { canonicalCardId: canonicalCard.id },
  })
}

/**
 * Online dedup helper. Used by the articulation chat path to find an
 * existing canonical that matches a freshly-submitted ValuesCard. No
 * embeddings, no DBSCAN — just one structured LLM call against all
 * canonicals in the deliberation.
 */
export async function fetchSimilarCanonicalCard(
  deliberationId: number,
  candidate: ValuesCard
): Promise<CanonicalValuesCard | null> {
  const canonicals = await fetchCanonicals(deliberationId)
  if (!canonicals.length) return null
  const { canonicalId } = await findCanonicalDuplicate({
    candidate: toCardLike(candidate),
    existingCanonicals: canonicals.map(toCardLike),
  })
  if (canonicalId === null) return null
  return canonicals.find((c) => c.id === canonicalId) ?? null
}

/**
 * Re-export findDuplicateContext from contexts.ts for backwards compatibility.
 * Existing callers (e.g. `services/generation.ts`) use `fetchDuplicateContext`.
 */
export async function fetchDuplicateContext(
  context: string,
  deliberationId: number
): Promise<string | null> {
  return findDuplicateContextPrompt(deliberationId, context)
}

// Cron function — kicks the per-deliberation dedup event for every deliberation.
export const deduplicateCron = inngest.createFunction(
  {
    id: "deduplicate-cron",
    concurrency: 1,
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step, logger }) => {
    logger.info("Running deduplication cron job.")
    const deliberations = await step.run(
      "Fetching all deliberations",
      async () => db.deliberation.findMany()
    )
    for (const deliberation of deliberations) {
      await step.sendEvent("deduplicate", {
        name: "deduplicate",
        data: { deliberationId: deliberation.id },
      })
    }
    return { message: "Triggered deduplication for all deliberations." }
  }
)

/**
 * Per-deliberation dedup. One structured LLM call partitions all
 * non-canonicalized cards and (in the same pass) maps each cluster to an
 * existing canonical when one applies. The remaining clusters become new
 * canonicals via createOrFetchCanonicalCard.
 */
export const deduplicate = inngest.createFunction(
  { id: "deduplicate", triggers: { event: "deduplicate" } },
  async ({ event, step, logger }) => {
    const deliberationId = event.data.deliberationId as number
    logger.info(`Running prompt-based deduplication for deliberation ${deliberationId}.`)

    const cards = (await step.run(
      `Get non-canonicalized cards for deliberation ${deliberationId}`,
      async () => fetchNonCanonicalizedValues(deliberationId, 100)
    )) as unknown as ValuesCard[]
    if (cards.length === 0) {
      logger.info(`No cards to deduplicate for deliberation ${deliberationId}.`)
      // Always emit the finished event so the simulation orchestrator never hangs.
      await step.sendEvent("deduplicate-finished", {
        name: "deduplicate-finished",
        data: { deliberationId },
      })
      return { message: `No cards to deduplicate for deliberation ${deliberationId}.` }
    }

    const canonicals = (await step.run(
      `Get existing canonicals for deliberation ${deliberationId}`,
      async () => fetchCanonicals(deliberationId)
    )) as unknown as CanonicalValuesCard[]

    const partition = await step.run(
      `Partition ${cards.length} cards into clusters`,
      async () =>
        partitionValues({
          candidates: cards.map(toCardLike),
          existingCanonicals: canonicals.map(toCardLike),
        })
    )

    logger.info(
      `Partition produced ${partition.clusters.length} clusters for deliberation ${deliberationId}.`
    )

    let i = 0
    for (const cluster of partition.clusters) {
      i++
      const memberCards = cards.filter((c) => cluster.memberIds.includes(c.id))
      if (memberCards.length === 0) continue

      let canonical: CanonicalValuesCard
      if (cluster.existingCanonicalId !== null) {
        const existing = canonicals.find(
          (c) => c.id === cluster.existingCanonicalId
        )
        if (existing) {
          canonical = existing
          logger.info(
            `Cluster ${i} (${memberCards.length} cards) → existing canonical #${existing.id}`
          )
        } else {
          // Hallucinated id; fall back to creating a new canonical.
          logger.warn(
            `Cluster ${i} referenced unknown canonical #${cluster.existingCanonicalId}; creating a new canonical.`
          )
          canonical = (await step.run(
            `Create canonical for cluster ${i}`,
            async () => createOrFetchCanonicalCard(memberCards[0])
          )) as unknown as CanonicalValuesCard
        }
      } else {
        canonical = (await step.run(
          `Create canonical for cluster ${i}`,
          async () => createOrFetchCanonicalCard(memberCards[0])
        )) as unknown as CanonicalValuesCard
        logger.info(
          `Cluster ${i} (${memberCards.length} cards) → new canonical #${canonical.id} ("${canonical.title}")`
        )
      }

      await step.run(`Link cluster ${i} to canonical #${canonical.id}`, async () =>
        linkClusterToCanonicalCard(memberCards, canonical)
      )
    }

    logger.info(
      `Done. Deduplicated ${cards.length} cards into ${partition.clusters.length} clusters for deliberation ${deliberationId}.`
    )

    await step.sendEvent("deduplicate-finished", {
      name: "deduplicate-finished",
      data: { deliberationId },
    })

    return {
      message: `Deduplicated ${cards.length} cards into ${partition.clusters.length} clusters for deliberation ${deliberationId}.`,
    }
  }
)
