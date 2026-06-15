import { Link } from "@remix-run/react"
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Code2,
  ExternalLink as ExternalLinkIcon,
  Network,
  Vote,
} from "lucide-react"
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

const LINKS = [
  {
    href: "https://moral-graph.vercel.app/deliberation/33/graph",
    label: "Trial Run: Graph",
    description: "Explore a finished moral graph from a real deliberation.",
    icon: Network,
  },
  {
    href: "https://moral-graph.vercel.app/deliberation/33/60/report",
    label: "Trial Run: Policy Interventions",
    description: "See the policy interventions surfaced from those values.",
    icon: Vote,
  },
  {
    href: "https://arxiv.org/abs/2404.10636",
    label: "Paper",
    description: "The research behind the method, with full results.",
    icon: BookOpen,
  },
  {
    href: "https://github.com/meaningalignment/moral-graph-elicitation",
    label: "Code",
    description: "The open-source platform on GitHub.",
    icon: Code2,
  },
  {
    href: "https://moral-graph.vercel.app/",
    label: "Hosted Platform",
    description: "Run your own deliberation.",
    icon: ExternalLinkIcon,
  },
] as const

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
      <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 px-6 text-center text-sm text-muted-foreground">
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
        className="w-full rounded-xl border border-border shadow-sm"
      />
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="w-full rounded-xl border border-border shadow-sm"
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
      <div className="flex items-start gap-3">
        {number ? (
          <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary/10 font-serif text-sm font-semibold text-primary">
            {number}
          </span>
        ) : null}
        <h3 className="font-serif text-xl font-semibold leading-snug tracking-tight">
          {title}
        </h3>
      </div>
      <Media src={src} alt={alt} placeholder={placeholder} />
      {children ? (
        <div className="space-y-4 text-[15px] leading-relaxed text-foreground/80">
          {children}
        </div>
      ) : null}
    </section>
  )
}

function SectionHeading({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string
  title: string
  intro?: string
}) {
  return (
    <div className="mb-8">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary/70">
        {eyebrow}
      </p>
      <h2 className="font-serif text-3xl font-semibold tracking-tight">
        {title}
      </h2>
      {intro ? (
        <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
          {intro}
        </p>
      ) : null}
    </div>
  )
}

export default function Explanation() {
  return (
    <div className="min-h-screen w-full">
      <div className="mx-auto max-w-2xl px-6 py-10 sm:py-16">
        {/* Header */}
        <header className="mb-14">
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-8">
            <Link to="/auth/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to sign in
            </Link>
          </Button>
          <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
            Moral Graph Elicitation
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            A walkthrough of how this process works, and why it surfaces the
            collective's wisest values — not just the average ones.
          </p>
        </header>

        {/* Useful links */}
        <nav aria-label="Useful links" className="mb-16">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Useful links
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {LINKS.map(({ href, label, description, icon: Icon }) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex h-full items-start gap-3 rounded-xl border border-border bg-card/60 p-4 transition-colors hover:border-primary/40 hover:bg-card"
                >
                  <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 font-medium leading-tight">
                      {label}
                      <ArrowUpRight className="h-3.5 w-3.5 flex-none text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                    </span>
                    <span className="mt-1 block text-sm leading-snug text-muted-foreground">
                      {description}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Full walkthrough video */}
        <section className="mb-16">
          <SectionHeading
            eyebrow="Overview"
            title="Full Walkthrough"
            intro="A few-minute tour of the whole process, end to end."
          />
          {MEDIA.walkthroughVideo ? (
            <video
              src={MEDIA.walkthroughVideo}
              controls
              playsInline
              className="w-full rounded-xl border border-border shadow-sm"
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 px-6 text-center text-sm text-muted-foreground">
              Walkthrough video — Moral_Graph_Elicitation_Walkthrough.mp4
            </div>
          )}
        </section>

        {/* Process */}
        <section className="mb-16">
          <SectionHeading
            eyebrow="How it works"
            title="The Process"
            intro="Four steps take participants from a conversation about what matters to them, to a graph of the collective's wisest values."
          />
          <div className="space-y-12">
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
        <section className="mb-16">
          <SectionHeading
            eyebrow="Why it matters"
            title="Benefits"
            intro="What this approach surfaces that voting and other methods miss."
          />
          <div className="space-y-6">
            <article className="rounded-2xl border border-border bg-card/40 p-6 sm:p-8">
              <Step
                title="Expertise is surfaced"
                src={MEDIA.informedAuto}
                alt="Expertise being surfaced from participants"
                placeholder="Informed automation — Adobe_Express_-_informed-auto_(1).gif"
              >
                <p>
                  The winning value for a deliberation with 500 representative
                  Americans on abortion was one articulated by a Christian girl
                  who had an abortion when she was young, and felt mistreated by
                  the system. When counting on votes, this value is drowned out,
                  but it rose to the top when using our graph approach. In other
                  words, our process surfaces a kind of expertise that is drowned
                  out by voting.
                </p>
                <Media
                  src={MEDIA.expertiseScreenshot}
                  alt="Expertise surfaced in the results"
                  placeholder="Result — Screenshot_2025-10-01_at_22.21.03.png"
                />
              </Step>
            </article>

            <article className="rounded-2xl border border-border bg-card/40 p-6 sm:p-8">
              <Step
                title="Finds the wisest values, not just average ones"
                src={MEDIA.religiousBeliefs}
                alt="Comparing values to find the wiser one"
                placeholder="Religious beliefs — Adobe_Express_-_religious-beliefs.gif"
              >
                <p>
                  Participants vote not on values directly, but on which ones
                  they think are wiser than others. For example, when asked about
                  US abortion policy for Christian girls, some participants
                  thought policy should consider religious tenets. However, a
                  majority agreed that considering her personal relationship to
                  her faith is a wiser way to approach the same thing.
                </p>
                <Media
                  src={MEDIA.findWiseMentors}
                  alt="Connecting to wise mentors as a wiser intervention"
                  placeholder="Find wise mentors — Adobe_Express_-_find-wise-mentors_(1).gif"
                />
                <p>
                  In this example, participants unanimously agreed that it is
                  wiser to help a Christian girl considering an abortion by
                  connecting her to wise mentors rather than presenting her with
                  diverse viewpoints. This can lead us to new, innovative
                  interventions.
                </p>
              </Step>
            </article>

            <article className="rounded-2xl border border-border bg-card/40 p-6 sm:p-8">
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
                  drilling down into what's actually important to participants.
                  We also look for precedence; for example, a similar
                  intervention was implemented in Ireland in 2019.
                </p>
              </Step>
            </article>

            <article className="rounded-2xl border border-border bg-card/40 p-6 sm:p-8">
              <Step
                title="Identifies bridging values"
                src={MEDIA.comeTogether}
                alt="Republicans and Democrats converging on a shared wiser value"
                placeholder="Come together — Adobe_Express_-_come-together_(1).gif"
              >
                <p>
                  Republicans and Democrats often begin with different values,
                  but sometimes converge on a third, wiser one. In the report
                  view, Democrat-leaning votes are blue and Republican-leaning
                  votes are red. In this case, both sides agreed:{" "}
                  <em>Faith-anchored personal growth</em> is the wisest way to
                  support the girl with her religious beliefs.
                </p>
              </Step>
            </article>

            <article className="rounded-2xl border border-border bg-card/40 p-6 sm:p-8">
              <Step
                title="Comparison to Pol.is"
                src={MEDIA.polisComparison}
                alt="Comparison of Moral Graph Elicitation to Pol.is"
                placeholder="Pol.is comparison — Screenshot_2025-10-01_at_22.12.53.png"
              >
                <p>
                  More information{" "}
                  <ExternalLink href="https://arxiv.org/pdf/2404.10636">
                    in our paper
                  </ExternalLink>
                  .
                </p>
                <p className="text-sm text-muted-foreground">
                  CCAI here refers to a comparison study done using Pol.is.
                </p>
                <Media
                  src={MEDIA.paperFigure}
                  alt="Figure from the paper"
                  placeholder="Paper figure — Screenshot_2025-10-02_at_09.25.49.png"
                />
              </Step>
            </article>
          </div>
        </section>

        {/* Footer CTA */}
        <div className="rounded-2xl border border-border bg-card/40 px-6 py-10 text-center">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">
            Ready to try it?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            Sign in to start a deliberation, or explore one of the trial runs
            above.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link to="/auth/login">
              Get started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <p className="mt-8 text-sm text-muted-foreground">
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
