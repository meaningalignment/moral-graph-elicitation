import { CanonicalValuesCard } from "@prisma/client"
import { db, inngest } from "~/config.server"
import {
  generateUpgrades,
  generateUpgradesToValue,
  type Upgrade,
  type Value,
} from "~/lib/values-tools"

export async function upsertUpgradesInDb(
  upgrades: Upgrade[],
  hypothesisRunId: string,
  contextId: string,
  deliberationId: number
): Promise<void> {
  console.log(
    `Upserting ${upgrades.length} upgrades to the database for deliberation ${deliberationId} and context ${contextId}`
  )

  for (const upgrade of upgrades) {
    await db.edgeHypothesis.upsert({
      where: {
        fromId_toId_contextId_deliberationId: {
          fromId: upgrade.a_id,
          toId: upgrade.b_id,
          contextId,
          deliberationId,
        },
      },
      create: {
        hypothesisRunId,
        story: upgrade.story,
        from: { connect: { id: upgrade.a_id } },
        to: { connect: { id: upgrade.b_id } },
        deliberation: { connect: { id: deliberationId } },
        context: {
          connect: {
            id_deliberationId: {
              id: contextId,
              deliberationId,
            },
          },
        },
      },
      update: {
        story: upgrade.story,
        hypothesisRunId,
      },
    })
  }
}

async function getContextsWithLinksToValues(deliberationId: number) {
  return db.context.findMany({
    where: {
      deliberationId,
      ContextsForQuestions: {
        some: {
          question: {
            deliberationId,
            isArchived: false,
          },
        },
      },
    },
    include: {
      ContextsForQuestions: {
        select: {
          question: {
            select: {
              ValuesCard: {
                select: {
                  canonicalCardId: true,
                },
              },
            },
          },
        },
      },
    },
  })
}

/**
 * Pick canonical-value candidates for upgrade-story generation in a given
 * context. We only include cards that were articulated for one of the
 * context's questions (the same eligibility filter the previous embedding
 * implementation used) and cap the list at `limit`. The downstream
 * `generateUpgrades` step is itself an LLM that will pick which pairs
 * actually make sense as upgrades — there is no cosine-distance benefit
 * here.
 */
function getCandidateValues(
  values: CanonicalValuesCard[],
  context: {
    ContextsForQuestions: {
      question: { ValuesCard: { canonicalCardId: number | null }[] }
    }[]
  },
  limit: number = 12
) {
  return values
    .filter((cc) =>
      context.ContextsForQuestions.some((c) =>
        c.question.ValuesCard.some((vc) => vc.canonicalCardId === cc.id)
      )
    )
    .slice(0, limit)
}

async function generateReversedUpgrades(
  upgrades: Upgrade[],
  values: Value[],
  contextId: string
) {
  const reversed = upgrades.map((u) => {
    const oldTarget = values.find((v) => v.id === u.b_id)
    const oldSource = values.find((v) => v.id === u.a_id)
    return generateUpgradesToValue(oldSource!, [oldTarget!], contextId)
  })

  return (await Promise.all(reversed)).flat()
}

export const hypothesizeCron = inngest.createFunction(
  {
    id: "hypothesize-cron",
    concurrency: 1,
    triggers: [{ cron: "0 */12 * * *" }],
  },
  async ({ step, logger }) => {
    await step.sendEvent("hypothesize", { name: "hypothesize", data: {} })

    // Get all deliberations
    const deliberations = await step.run(
      "Fetching all deliberations",
      async () => {
        return db.deliberation.findMany()
      }
    )

    for (const deliberation of deliberations) {
      // Get the latest canonical card for this deliberation
      const latestCanonicalCard = await step.run(
        `Get latest canonical card for deliberation ${deliberation.id}`,
        async () =>
          db.canonicalValuesCard.findFirst({
            where: { deliberationId: deliberation.id },
            orderBy: { createdAt: "desc" },
          })
      )

      // Check if the latest card is older than 12 hours
      if (
        latestCanonicalCard?.createdAt &&
        new Date(latestCanonicalCard.createdAt) >
          new Date(Date.now() - 12 * 60 * 60 * 1000)
      ) {
        // If the card is recent, trigger the hypothesize event
        await step.sendEvent("hypothesize", {
          name: "hypothesize",
          data: { deliberationId: deliberation.id },
        })
      } else {
        logger.info(
          `Skipping deliberation ${deliberation.id}: Latest card is more than 12 hours old or doesn't exist.`
        )
      }
    }

    return {
      message: "Triggered hypothesization runs for eligible deliberations.",
    }
  }
)

export const hypothesize = inngest.createFunction(
  {
    id: "hypothesize",
    concurrency: 1,
    triggers: { event: "hypothesize" },
  },
  async ({ event, step, logger, runId }) => {
    const deliberationId = event.data!.deliberationId as number
    logger.info(`Running hypothetical links generation`)

    // Get contexts, and for which cards they apply
    const contexts = await step.run("Fetching contexts", async () =>
      getContextsWithLinksToValues(deliberationId)
    )

    logger.info(
      `About to generate upgrades for deliberation ${deliberationId} and these contexts: ${contexts
        .map((c) => c.id)
        .join(", ")}`
    )

    const values = (await step.run("Fetching canonical values", async () =>
      db.canonicalValuesCard.findMany({
        where: { deliberationId, isArchived: false },
      })
    )) as unknown as CanonicalValuesCard[]

    //
    // Generate plausible upgrades for each context.
    // Also generate the upgrades in reverse.
    //
    const allUpgrades: Upgrade[] = []

    for (const context of contexts) {
      const closestValues = getCandidateValues(values, context, 12)

      const plausibleUpgrades = await step.run(
        `Generate upgrades for context ${context.id} from ${closestValues.length} values`,
        async () => generateUpgrades(closestValues, context.id)
      )

      if (!plausibleUpgrades.length) {
        logger.info(`No upgrades found for context ${context.id}`)
        continue
      }

      const reverseUpgrades = await step.run(
        `Reversing ${plausibleUpgrades.length} upgrades for context ${context.id}`,
        async () =>
          generateReversedUpgrades(plausibleUpgrades, values, context.id)
      )

      const newUpgrades = [...plausibleUpgrades, ...reverseUpgrades]
      allUpgrades.push(...newUpgrades)

      await step.run(
        `Add upgrades & reverse upgrades for context ${context.id} to database`,
        async () =>
          upsertUpgradesInDb(newUpgrades, runId, context.id, deliberationId)
      )
    }

    await step.sendEvent("hypothesize-finished", {
      name: "hypothesize-finished",
      data: { deliberationId },
    })

    return { message: `Success! Created ${allUpgrades.length} new upgrades.` }
  }
)

export async function hypothesizeManual(
  deliberationId: number,
  pairs: {
    fromId: number
    toId: number
    contextId: string
  }[]
) {
  const runId = `manual-${Date.now()}`
  const uniqueIds = new Set<number>()
  pairs.forEach((pair: any) => {
    uniqueIds.add(pair.fromId)
    uniqueIds.add(pair.toId)
  })
  const valueIds = Array.from(uniqueIds)
  const values = await db.canonicalValuesCard.findMany({
    where: {
      id: {
        in: valueIds,
      },
    },
  })

  for (const pair of pairs) {
    const sourceValue = values.find((v) => v.id === pair.fromId)
    const targetValue = values.find((v) => v.id === pair.toId)

    if (sourceValue && targetValue) {
      // Generate forward upgrade
      const forwardUpgrade = (
        await generateUpgradesToValue(
          sourceValue,
          [targetValue],
          pair.contextId
        )
      )[0]

      // Generate reverse upgrade
      const reverseUpgrade = (
        await generateUpgradesToValue(
          targetValue,
          [sourceValue],
          pair.contextId
        )
      )[0]

      const upgrades = [forwardUpgrade, reverseUpgrade].filter(Boolean)

      if (upgrades.length > 0) {
        console.log(
          `Upserting upgrades for pair ${sourceValue.id} <-> ${targetValue.id} in db`
        )
        await upsertUpgradesInDb(
          upgrades,
          runId,
          pair.contextId,
          deliberationId
        )
      } else {
        console.error(
          `No upgrades found for pair ${sourceValue.id} <-> ${targetValue.id}`
        )
      }
    }
  }
}
