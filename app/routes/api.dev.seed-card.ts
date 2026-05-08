import { ActionFunctionArgs, redirect } from "@remix-run/node"
import { auth, db } from "~/config.server"
import { persistArticulatedCard } from "~/services/articulation/chat"

/**
 * Dev/test helper: persist a "fake" articulated values card on a thread so the
 * chat UI flips into the finished state without having to actually carry out
 * the conversation. Picks a random canonical card from the deliberation; if
 * none exist yet, picks a random articulated card; if neither, falls back to a
 * hardcoded sample.
 *
 * Triggered by the small "Seed random value" link rendered at the bottom of
 * the chat route.
 */
export async function action({ request }: ActionFunctionArgs) {
  const userId = await auth.getUserId(request)
  if (!userId) throw new Response("Unauthorized", { status: 401 })

  const formData = await request.formData()
  const threadId = formData.get("threadId") as string
  const deliberationId = Number(formData.get("deliberationId"))
  const questionId = Number(formData.get("questionId"))

  if (!threadId || !deliberationId || !questionId) {
    throw new Response("Missing threadId / deliberationId / questionId", {
      status: 400,
    })
  }

  // Try canonical first — those are the "real" library of cards. Fall back to
  // any articulated card on the deliberation, then to a hardcoded sample.
  const canonicalCount = await db.canonicalValuesCard.count({
    where: { deliberationId, isArchived: false },
  })

  let card: { title: string; description: string; policies: string[] } | null =
    null

  if (canonicalCount > 0) {
    const skip = Math.floor(Math.random() * canonicalCount)
    const picked = await db.canonicalValuesCard.findFirst({
      where: { deliberationId, isArchived: false },
      skip,
      select: { title: true, description: true, policies: true },
    })
    if (picked) card = picked
  }

  if (!card) {
    const articulatedCount = await db.valuesCard.count({
      where: { deliberationId },
    })
    if (articulatedCount > 0) {
      const skip = Math.floor(Math.random() * articulatedCount)
      const picked = await db.valuesCard.findFirst({
        where: { deliberationId },
        skip,
        select: { title: true, description: true, policies: true },
      })
      if (picked) card = picked
    }
  }

  if (!card) {
    card = {
      title: "Honest Reckoning",
      description:
        "Helping someone face a hard truth without softening it into something that lets them hide.",
      policies: [
        "MOMENTS where the speaker is rehearsing a decision they have already made",
        "WORDS that turn a fear into a fact, especially the small ones",
        "GAPS between what someone says they want and what their life looks like",
      ],
    }
  }

  await persistArticulatedCard({
    authorId: userId,
    threadId,
    deliberationId,
    questionId,
    transcript: [
      {
        role: "user",
        content: "[seeded for testing]",
      },
    ],
    card,
  })

  // Bounce back to the chat — loader re-runs, picks up the new KV data,
  // Chat component sees the values_card message and flips ChatPanel into
  // the "finished" state with the Continue button.
  return redirect(
    `/deliberation/${deliberationId}/${questionId}/chat/${threadId}`
  )
}
