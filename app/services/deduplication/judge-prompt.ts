/**
 * Deduplication clustering prompt — provided verbatim by the project owner.
 *
 * This is the rubric for deciding whether two ValuesCards represent the
 * same source of meaning. Used by:
 *  - The in-repo LLM judge (alternative to values-tools' getExistingDuplicateValue
 *    when we want full transparency).
 *  - tests/pipeline/dedup.fixture.ts as the ground-truth rubric.
 */
export const DEDUPLICATE_VALUES_PROMPT = `# Deduplicate Attention Policies

You are given a list of values. A value represents a source of meaning through a set of attention policies. Cluster the values that essentially represent the same source of meaning through their policies.


### Sources of meaning

A source of meaning is a set of attention policies that fit together into a way of living that is important to someone when choosing a certain thing. Something where just attending to what is in the policies and making good choices based on them is itself how they want to live.

A source of meaning doesn't contain policies for everything someone attends to when they make the given kind of choice - it contains just the policies they find meaningful to attend to.

### Attention Policies

Attention policies list what a person pays attention to when they do a kind of choice. Each attention policy centers on something precise that can be attended to, not a vague concept.

# Guidelines for Determining Equivalent Sources of Meaning

Two or more sets of attention policies represent the same source of meaning if and only if they meet ALL of the following criteria:

1. Completeness: A person who articulated one set would feel that the other set(s) fully capture what they cared about.

2. Practical Equivalence: Someone instructed to follow one set of policies would, in practice, pay attention to the same things as someone following the other set(s).

3. Design Alignment: An experience designed to enable the policies in one set would inherently serve the policies of the other set(s) as well.

4. Mutual Correction: Any differences between the sets would be recognized as oversights or mistakes by proponents of either set. Both sets would be updated to align with each other if such differences were identified.

5. Granularity Consistency: The sets are formulated using approximately the same level of detail and specificity. While exact wording may differ, the overall scope and depth of the policies are comparable.

Important: All five criteria must be satisfied for sets to be considered equivalent. If any criterion is not met, the sets represent distinct sources of meaning.`

export const DEDUPLICATE_CRITERIA = [
  "Completeness",
  "Practical Equivalence",
  "Design Alignment",
  "Mutual Correction",
  "Granularity Consistency",
] as const
