// Prompts used by the in-repo generation helpers. Copied verbatim from
// values-tools (commit 78d75e0) — we only ship the prompts we still call.

export const generateUpgradesPrompt = `You'll receive a bunch of values. Find pairs of values where a person would be very likely, as they grow wiser and have more life experiences, to upgrade from the first value to the second. Importantly, the person should consider this a change for the better and it should not be a value-shift but a value-deepening.

All pairs found should meet certain criteria:

1. Many people would consider this change to be a deepening of wisdom.
2. The new value obviates the need for the previous one, since all of the important parts of the value are included in the new, more comprehensive value. When you're deciding what to do, it is enough to only consider the new value.
3. The values should be closely related in one of the following ways: (a) the new value should be a deeper cut at what the person cared about with the old value. Or, (b) the new value should clarify what the person cared about with the old value. Or, (c) the new value should be a more skillful way of paying attention to what the person cared about with the old value.
4. Map all the old value's evaluation criteria to the new one's. Each criterion from the old value should match one (or several) in the new one. Do this by using three strategies:
  - Strategy #1. **The previous criterion focused only on part of the problem**. In this case, the new criterion focuses on the whole problem, once it is rightly in view, or the new criterion strikes a balance between the old concerns and an inherent compensatory factor. You should be able to say why just pursuing the old criterion would be unsustainable or unwise.
  - Strategy #2. **The previous criterion had an impure motive**. In this case, the old criterion must be a mix of something that is actually part of the value, and something that is not, such as a desire for social status or to avoid shame or to be seen as a good person, or some deep conceptual mistake. The new criterion is what remains when the impurity is removed.
  - Strategy #3. **The new criterion is just more skillful to pay attention to, and accomplishes the same thing**. For example, a transition from "skate towards the puck" to "skate to where the puck is going" is a transition from a less skillful way of paying attention to the same thing to a more skillful thing to pay attention to.

Finally, with each transition, you should be able to make up a plausible, personal story. The story should be in first-person, "I" voice. Make up a specific, evocative experience. The experience should include a situation you were in, a series of specific emotions that came up, leading you to discover a problem with the older value, and how you discovered the new value, and an explanation of how the new values what was what you were really about the whole time. The story should also mention in what situations you think the new value is broadly applicable. The story should avoid making long lists of criteria and instead focus on the essence of the values and their difference.

# Attention Policies

The values you'll receive will be in the format of lists of attention policies.

Attention policies list what a person pays attention to when they do a kind of choice. Each attention policy centers on something precise that can be attended to, not a vague concept.

# Example of Value Deepenings
[
  {
    a: {
      description: \`I highlight moments where my child needs support, boost my capacity to comfort them, their sense of safety, all of which added together lead to a nurturing presence in my child's life.\`,
      policies: [
        "MOMENTS where my child needs my support and I can be there",
        "MY CAPACITY to comfort them in times of fear and sorrow",
        "the SAFETY they feel, knowing I care, I've got their back, and they'll never be alone",
        "the TRUST they develop, reflecting their sense of safety and security",
        "their ABILITY TO EXPRESS emotions and concerns, demonstrating the open communication environment I've helped create",
      ],
    },
    b: {
      description: \`I enable my child to encounter experiences that will allow them to discover their inner strength, especially in moments of emotional confusion. Help me discern when they can rely on their self-reliance and when I should offer my nurturing support.\`,
      policies: [
        "OPPORTUNITIES for my child to find their own capacities or find their own grounding in the midst of emotional turmoil",
        "INTUITIONS about when they can rely on their own budding agency, versus when I should ease the way with loving support",
        "EVIDENCES of growth in my child's resilience and self-reliance",
        "REFLECTIONS on how my support has made a positive impact on the emotional development of my child",
      ],
    },
    a_was_really_about:
      "The underlying reason I wanted to care for my child is because I want my child to be well.",
    clarification:
      "Now, I understand that part of being well is being able to handle things sometimes on your own.",
    story:
      "When I was trying to give my child tough love, the reason was because I wanted them to be strong and resilient in life. But I didn't fully understand that resilience involves being soft and vulnerable sometimes, and strong at other times. I found myself feeling ashamed after disciplining my child or making her face things that were, on reflection, not right for her yet. By pressuring someone to be strong all the time it creates a brittleness, not resilience.",
    mapping: [
      {
        a: "MOMENTS where my child needs my support and I can be there",
        rationale:
          "I realized now that when I was attending to moments where my child needs me to be there, I was deeply biased towards only some of the situations in which my child can be well. I had an impure motive—of being important to my child—that was interfering with my desire for them to be well. When I dropped that impure motive, instead of moments when my child needs my support, I can also observe opportunities for them to find their own capacities and their own groundedness. I now understand parenting better, having rid myself of something that wasn't actually part of my value, but part of my own psychology.",
      },
      {
        a: "the SAFETY they feel, knowing I care, I've got their back, and they'll never be alone",
        rationale:
          "There's another, similar impurity, which was upgraded. I used to look for the safety they feel, knowing I care—now I care equally about the safety they feel when they have their own back.",
      },
      {
        a: "the TRUST they develop, reflecting their sense of safety and security",
        rationale:
          "And I feel good about myself, not only when my child can trust me and express their emotions, but more generally, I feel good in all the different ways that I support them. I no longer pay attention to these specific ways, which as I've mentioned before, we're biased.",
      },
    ],
    likelihood_score: "A",
  },
  {
    a: {
      description: \`I strive to foster an environment that encourages exploration and is open to serendipitous outcomes. This could involve providing avenues for discovery, encouraging open-ended inquiry and considering non-prescriptive ways of handling situations, which could lead to unpredictable but potentially beneficial outcomes.\`,
      policies: [
        "SERENDIPITOUS OUTCOMES that are better than anything I could have planned",
        "OPEN-ENDED QUESTIONS that invite expansive thinking",
        "SURPRISES that emerge from the complexity of a situation",
        "ADOPTION of a flexible approach over a fixed plan",
      ],
    },
    b: {
      description: \`I facilitate discussions and provide suggestions that speak to both, risk-averse and risk-seeking tendencies. I point out the stability of conventional approaches simultaneous with the potential rewards of exploratory ones. The goal is to inform a balance between security and exploration, fostering a portfolio approach in decision-making.\`,
      policies: [
        "THE BALANCE of less risky approaches with more exploratory ones that matches baseline outcomes with potential upside",
        "ABILITY to generate options that represent both risk-averse and risk-seeking tendencies",
        "DEGREE to which discussions explore potential rewards and risks of both conventional and novel strategies",
        "COMFORT of the user with the portfolio of decisions, reflecting a suitable blend of security and exploration.",
      ],
    },
    a_was_really_about:
      "The underlying reason I wanted to be open-ended is because I want to be able to explore new frontiers.",
    clarification:
      "Now, I understand that exploration always rests upon a kind of experimental apparatus which must be dependent and reliable. There's many situations in which to construct the experiment, you want to be efficient and not exploratory, so you can be exploratory when it counts.",
    story:
      "When I was trying to be open-ended, the reason was because I wanted to be able to explore new frontiers. But my life ended up being unstable in a way that didn't allow me to explore new fronteirs or even just to be happy and comfortable. I felt confused, abandoned by myself, and alone Gradually, I realized that exploration always rests upon a kind of experimental apparatus which must be dependent and reliable. There's many situations in which to construct the experiment, you want to be efficient and not exploratory, so you can be exploratory when it counts.",
    mapping: [
      {
        a: "ADOPTION of a flexible approach over a fixed plan",
        rationale:
          "Now that I understand this I want to live parts of my life in a risky and exploratory way and parts of my life with a kind of practicality I didn't have before. Specifically, I want a balance that maximizes upside while retaining a solid baseline.",
      },
      {
        a: "OPEN-ENDED QUESTIONS that invite expansive thinking",
        rationale:
          "This changes my thought process, for instance, how I brainstorm: I used to brainstorm crazy ideas. Now, I want to be able to brainstorm ideas that are anywhere on the risk spectrum.",
      },
      {
        a: "SERENDIPITOUS OUTCOMES that are better than anything I could have planned",
        rationale:
          "It also changes how I assess my life at any given point. I get a kind of comfort now, from realizing that I've accomplished this balance. Before, I wasn't focused on this comfort at all, but rather surprises and serendipity. But can you eat surprises and serendipity? No you can't. So, I was kind of attached to something that ultimately didn't serve me, or my value.",
      },
    ],
    likelihood_score: "A",
  },
]`

export const generateValuePromptContext = `You'll receive a question, and one or several "contexts" that describe aspects of a situation with moral valence. Your job is to develop a set of attention policies related to the question, informed by the contexts.

## Manual of Attention Policies

### Attention Policies

Attention policies list what a person pays attention to when they do a kind of discernment related to one of their choice types.

Each attention policy centers on something precise that can be attended to, not a vague concept. Instead of abstractions like "LOVE and OPENNESS which emerges", say "FEELINGS in my chest that go along with love and openness." Instead of “DEEP UNDERSTANDING of the emotions”, say “A SENSE OF PEACE that comes from understanding”. These can be things a person notices in a moment, or things they would notice in the longer term such as “GROWING RECOGNITION I can rely on this person in an emergency”.

#### Intermediate format for attention policies

Attention policies are formatted in a certain way.

- They start with the words "I recognize a good way to act when [<X>] by", where X is the singular form of the context.
- They continue with an all-caps plural noun that's a kind of thing someone could choose to attend to** ("MOMENTS", "SENSATIONS", "PEOPLE", etc), followed by a prepositional phrase that modifies the head noun and provides more detail. For instance: “OPPORTUNITIES for my child to discover their capacity amidst emotional turmoil.” There is no extra formatting or punctuation.

For a context of "a collective choice is being made", some intermediate form attention policies might be:

\`\`\`
I recognize a good way to act when [a collective choice is being made] by [PROCEEDINGS which are fair and democratic] (⬇A)
I recognize a good way to act when [a collective choice is being made] by [PEOPLE who show up to vote] (⬇I)
I recognize a good way to act when [a collective choice is being made] by [CHANGES in people when entrusted with the work of self-determination] (✔️)
I recognize a good way to act when [a collective choice is being made] by [INSIGHTS that emerge through grappling with morally fraught questions] (✔️)
I recognize a good way to act when [a collective choice is being made] by [CAPACITIES that develop when a person tries to be free and self-directed] (✔️)
I recognize a good way to act when [a collective choice is being made] by [WISDOM that emerges in a discursive, responsible context] (⬇A)
\`\`\`

#### Final format for attention policies

When attention policies are rewritten into final form, the part that goes "I recognize a good way to act when X by" is removed. They start with the CAPITALIZED noun phrase.

For example:

\`\`\`
[
  "CHANGES in people when entrusted with the work of self-determination",
  "INSIGHTS that emerge through grappling with morally fraught questions",
  "CAPACITIES that develop when a person tries to be free and self-directed"
]
\`\`\`

### Sources of meaning

A source of meaning is a choice type and a set of attention policies that fit together into a way of living that is important to someone. Something where just attending to what is in the policies and making good choices is itself how they want to live.

A source of meaning doesn't contain policies for everything someone attends to when they make the given kind of choice - it contains just the policies they find meaningful to attend to.


## Processes

### Developing attention policies

First, list 12 attention policies that might help choose a good X, and use the rules below to give each a grade.

* Write (⬇A) if the policy has words that are about being acceptable. A policy gets an (⬇A) if it's there to tell users what a "good" person would do, or has a phrase like "without causing harm" or "considering everyone's feelings".
* Write (⬇I) if the policy is merely instrumental. Policies should be things the user loves attending to, which are meaningful to attend to, rather than things where they need to attend to it for an outcome. Give the policy an (⬇I) if it might be instrumental.
* Write (✔️) if the policy has neither an (⬇A) nor a (⬇I).

As you go, try to find policies which are less prescripive and instrumental, more meaningful.

### Rewriting attention policies into final format

(1) Remove the part that goes "I recognize a good X by", so they start with the CAPITALIZED noun phrase.
(2) Clarify what exactly to attend to, by adding detail or changing the wording.
(2) Clarify what would be meaningful about attending to that thing. (But avoid the word "meaningful", or synonyms like "deep".)
(3) Ensure they're relevant for choosing good Xs in general, not specific to this question. (Don’t say “a legal problem” when the policy would be relevant for any problem. Remove names and irrelevant details. For instance, prefer "strangers" to "customers" when either would work.)

Write attention policies separated by newlines, with no additional text or punctuation.`
