import { Link } from "@remix-run/react"
import { ArrowLeft } from "lucide-react"
import { Button } from "~/components/ui/button"
import { ExternalLink } from "~/components/external-link"

/**
 * Public walkthrough of the Moral Graph Elicitation process. Linked from the
 * login screen via "What's this?" and reachable without authentication.
 *
 * Content mirrors the Notion walkthrough:
 * https://humsys.notion.site/Moral-Graph-Elicitation-Walkthrough-27fc5bada1d0804695e5fb6af25af249
 *
 * MEDIA: The video / clips / screenshots are hosted in the "blobby" Vercel
 * Blob store on the moral-graph project. The original walkthrough GIFs were
 * re-encoded as muted looping MP4s (~4x smaller); they autoplay inline like a
 * GIF. Screenshots stay as images. Empty values fall back to a placeholder.
 */
const BLOB = "https://gkm8jz8uprwxyd65.public.blob.vercel-storage.com"

const MEDIA = {
  walkthroughVideo: `${BLOB}/Moral_Graph_Elicitation_Walkthrough.mp4`,
  // Process steps
  chatbot: `${BLOB}/chatbot.mp4`,
  edge: `${BLOB}/edge.mp4`,
  graph: `${BLOB}/graph.png`,
  policyInterventions: `${BLOB}/policy-interventions.mp4`,
  // Benefits
  informedAuto: `${BLOB}/informed-auto.mp4`,
  expertiseScreenshot: `${BLOB}/expertise-result.png`,
  religiousBeliefs: `${BLOB}/religious-beliefs.mp4`,
  findWiseMentors: `${BLOB}/find-wise-mentors.mp4`,
  faithHotline: `${BLOB}/faith-hotline.mp4`,
  comeTogether: `${BLOB}/come-together.mp4`,
  polisComparison: `${BLOB}/polis-comparison.png`,
  paperFigure: `${BLOB}/paper-figure.png`,
} as const

export const meta = () => [
  { title: "What is Moral Graph Elicitation?" },
  {
    name: "description",
    content:
      "A walkthrough of the Moral Graph Elicitation process: how a chatbot surfaces what's actually important to participants, and how the collective's wisest values are identified.",
  },
]

function Media({
  src,
  alt,
  placeholder,
}: {
  src: string
  alt: string
  placeholder: string
}) {
  if (!src) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 px-6 text-center text-sm text-muted-foreground">
        {placeholder}
      </div>
    )
  }
  // The walkthrough clips are muted looping MP4s — autoplay them inline like a
  // GIF. Screenshots are plain images.
  if (src.endsWith(".mp4")) {
    return (
      <video
        src={src}
        aria-label={alt}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="w-full rounded-lg border border-border shadow-sm"
      />
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="w-full rounded-lg border border-border shadow-sm"
    />
  )
}

function Step({
  number,
  title,
  src,
  alt,
  placeholder,
  children,
}: {
  number?: number
  title: string
  src: string
  alt: string
  placeholder: string
  children?: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <h3 className="font-serif text-xl font-semibold tracking-tight">
        {number ? `${number}. ` : ""}
        {title}
      </h3>
      <Media src={src} alt={alt} placeholder={placeholder} />
      {children ? (
        <div className="space-y-4 text-base leading-relaxed text-foreground/90">
          {children}
        </div>
      ) : null}
    </section>
  )
}

export default function Explanation() {
  return (
    <div className="min-h-screen w-full">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-10">
          <Button asChild variant="ghost" className="-ml-3 mb-6">
            <Link to="/auth/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to sign in
            </Link>
          </Button>
          <h1 className="font-serif text-4xl font-semibold tracking-tight">
            Moral Graph Elicitation
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            A walkthrough of how this process works, and why it surfaces the
            collective's wisest values.
          </p>
        </div>

        {/* Useful links */}
        <aside className="mb-12 rounded-lg border border-border bg-muted/40 p-5">
          <p className="mb-3 text-sm font-medium">🔍 Useful links</p>
          <ul className="grid gap-2 text-sm">
            <li>
              <ExternalLink href="https://moral-graph.vercel.app/deliberation/33/graph">
                Trial Run: Graph
              </ExternalLink>
            </li>
            <li>
              <ExternalLink href="https://moral-graph.vercel.app/deliberation/33/60/report">
                Trial Run: Policy Interventions
              </ExternalLink>
            </li>
            <li>
              <ExternalLink href="https://arxiv.org/abs/2404.10636">
                Paper
              </ExternalLink>
            </li>
            <li>
              <ExternalLink href="https://github.com/meaningalignment/moral-graph-elicitation">
                Code
              </ExternalLink>
            </li>
            <li>
              <ExternalLink href="https://moral-graph.vercel.app/">
                Hosted Platform
              </ExternalLink>
            </li>
          </ul>
        </aside>

        {/* Full walkthrough video */}
        <section className="mb-14 space-y-4">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">
            Full Walkthrough
          </h2>
          {MEDIA.walkthroughVideo ? (
            <video
              src={MEDIA.walkthroughVideo}
              controls
              playsInline
              className="w-full rounded-lg border border-border shadow-sm"
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 px-6 text-center text-sm text-muted-foreground">
              Walkthrough video — Moral_Graph_Elicitation_Walkthrough.mp4
            </div>
          )}
        </section>

        {/* Process */}
        <section className="mb-14">
          <h2 className="mb-6 font-serif text-2xl font-semibold tracking-tight">
            Process
          </h2>
          <div className="space-y-10">
            <Step
              number={1}
              title="A chatbot drills down into what's actually important to participants"
              src={MEDIA.chatbot}
              alt="Chatbot drilling down into a participant's values"
              placeholder="Chatbot demo — Adobe_Express_-_chatbot.gif"
            />
            <Step
              number={2}
              title="Participants decide whether certain values are wiser than others by voting on generated stories of someone changing their values"
              src={MEDIA.edge}
              alt="Voting on stories of someone changing their values"
              placeholder="Voting demo — Adobe_Express_-_edge_(1).gif"
            />
            <Step
              number={3}
              title="This results in a graph object that can be used to identify the wisest values of a collective"
              src={MEDIA.graph}
              alt="The resulting moral graph"
              placeholder="Moral graph — Screenshot_2025-10-01_at_22.01.44.png"
            />
            <Step
              number={4}
              title="The wisest values can then be used to, for example, identify policy interventions"
              src={MEDIA.policyInterventions}
              alt="Using the wisest values to identify policy interventions"
              placeholder="Policy interventions — Adobe_Express_-_policy-interventions_(1).gif"
            />
          </div>
        </section>

        {/* Benefits */}
        <section className="mb-14">
          <h2 className="mb-6 font-serif text-2xl font-semibold tracking-tight">
            Benefits
          </h2>
          <div className="space-y-12">
            <Step
              title="Expertise is surfaced"
              src={MEDIA.informedAuto}
              alt="Expertise being surfaced from participants"
              placeholder="Informed automation — Adobe_Express_-_informed-auto_(1).gif"
            >
              <p>
                The winning value for a deliberation with 500 representative
                Americans on abortion was one value articulated by a Christian
                girl who had an abortion when she was young, and felt mistreated
                by the system. When counting on votes, this value is drowned
                out, but it rose to the top when using our graph approach. In
                other words, our process surfaces a kind of expertise that is
                drowned out by voting.
              </p>
              <Media
                src={MEDIA.expertiseScreenshot}
                alt="Expertise surfaced in the results"
                placeholder="Result — Screenshot_2025-10-01_at_22.21.03.png"
              />
            </Step>

            <Step
              title="Finds the wisest values, not just average ones"
              src={MEDIA.religiousBeliefs}
              alt="Comparing values to find the wiser one"
              placeholder="Religious beliefs — Adobe_Express_-_religious-beliefs.gif"
            >
              <p>
                Participants vote not on values directly, but on which ones they
                think are wiser than others. For example, when asked about US
                abortion policy for Christian girls, some participants thought
                policy should consider religious tenets. However, a majority
                agreed that considering her personal relationship to her faith
                is a wiser way to approach the same thing.
              </p>
              <Media
                src={MEDIA.findWiseMentors}
                alt="Connecting to wise mentors as a wiser intervention"
                placeholder="Find wise mentors — Adobe_Express_-_find-wise-mentors_(1).gif"
              />
              <p>
                In this example, participants unanimously agreed that it is wiser
                to help a Christian girl considering an abortion by connecting
                her to wise mentors rather than presenting her with diverse
                viewpoints. This can lead us to new, innovative interventions.
              </p>
            </Step>

            <Step
              title="Surfaces an entirely new policy landscape"
              src={MEDIA.faithHotline}
              alt="A faith-sensitive support hotline intervention"
              placeholder="Faith hotline — Adobe_Express_-_faith-hotline.gif"
            >
              <p>
                When deciding what the US should do about abortion policy for
                Christian girls, our process surfaces new innovations, like a
                nationwide toll-free confidential hotline staffed by trained
                facilitators who could give faith-sensitive support. This is a
                non-ideological intervention both Republicans and Democrats can
                get behind, made possible by the values elicitation process
                drilling down into what's actually important to participants. We
                also look for precedence; for example, a similar intervention
                was implemented in Ireland in 2019.
              </p>
            </Step>

            <Step
              title="Identifies bridging values"
              src={MEDIA.comeTogether}
              alt="Republicans and Democrats converging on a shared wiser value"
              placeholder="Come together — Adobe_Express_-_come-together_(1).gif"
            >
              <p>
                Republicans and Democrats often begin with different values, but
                sometimes converge on a third, wiser one. In the report view,
                Democrat-leaning votes are blue and Republican-leaning votes are
                red. In this case, both sides agreed:{" "}
                <em>Faith-anchored personal growth</em> is the wisest way to
                support the girl with her religious beliefs.
              </p>
            </Step>

            <Step
              title="Comparison to Pol.is"
              src={MEDIA.polisComparison}
              alt="Comparison of Moral Graph Elicitation to Pol.is"
              placeholder="Pol.is comparison — Screenshot_2025-10-01_at_22.12.53.png"
            >
              <p className="text-sm text-muted-foreground">
                CCAI in this context refers to a comparison study done using
                Pol.is.
              </p>
              <p>
                More information{" "}
                <ExternalLink href="https://arxiv.org/pdf/2404.10636">
                  in our paper
                </ExternalLink>
                .
              </p>
              <Media
                src={MEDIA.paperFigure}
                alt="Figure from the paper"
                placeholder="Paper figure — Screenshot_2025-10-02_at_09.25.49.png"
              />
            </Step>
          </div>
        </section>

        <div className="border-t border-border pt-8 text-center">
          <Button asChild>
            <Link to="/auth/login">Get started</Link>
          </Button>
          <p className="mt-6 text-sm text-muted-foreground">
            Built by the{" "}
            <ExternalLink href="https://meaningalignment.org">
              Institute for Meaning Alignment
            </ExternalLink>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
