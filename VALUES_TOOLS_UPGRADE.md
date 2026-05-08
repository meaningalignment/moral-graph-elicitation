# Upgrading `values-tools` for `ai@5/6` compatibility

This repo depends on
[`meaningalignment/values-tools`](https://github.com/meaningalignment/values-tools)
as a tarball pinned to `main`. To unblock the AI SDK upgrade in
`moral-graph-elicitation`, `values-tools` needs two changes:

1. **A one-line bug fix** so `genObj` works under `@ai-sdk/openai@3.x` /
   `ai@4+` (it currently throws `Model does not have a default object
   generation mode`).
2. **A peer-dep bump** so we can install `ai@6` here without npm fighting it.

Apply these in the `values-tools` repo, push to `main`, then in this repo
run `bun update values-tools` to pick up the new SHA.

---

## 1. Fix `mode: "auto"` → `mode: "json"` in `genObj`

**File:** `src/services/ai.ts`

Find the `generateObject` call inside `genObj` (around line 93). The
current code:

```ts
const { object } = await generateObject({
  model: getLanguageModel(finalModel),
  schema,
  system: prompt,
  messages: [{ role: "user", content: renderedData }],
  temperature: finalTemperature,
  mode: "auto",
})
```

**Why it breaks:** with `mode: "auto"` the AI SDK resolves the mode by
reading `model.defaultObjectGenerationMode`. The newer `@ai-sdk/openai`
(3.x) and `@ai-sdk/anthropic` build for the LanguageModelV2 interface and
no longer expose that field — so the resolved mode becomes `undefined` and
`generateObject` throws.

**Fix:** force JSON-schema mode (works on every OpenAI + Anthropic model):

```ts
const { object } = await generateObject({
  model: getLanguageModel(finalModel),
  schema,
  system: prompt,
  messages: [{ role: "user", content: renderedData }],
  temperature: finalTemperature,
  mode: "json",
})
```

That's the minimum fix.

### Optional: expose `mode` as a parameter

Slightly more useful — let callers override:

```ts
export async function genObj<T extends ZodSchema>({
  prompt,
  data,
  schema,
  model,
  temperature,
  useCacheIfAvailable = true,
  mode = "json",
}: {
  prompt: string
  data: Record<string, any>
  schema: T
  temperature?: number
  model?: string
  useCacheIfAvailable?: boolean
  mode?: "json" | "tool"
}): Promise<z.infer<T>> {
  // …existing code…

  const { object } = await generateObject({
    model: getLanguageModel(finalModel),
    schema,
    system: prompt,
    messages: [{ role: "user", content: renderedData }],
    temperature: finalTemperature,
    mode,
  })

  // …existing code…
}
```

If you do this, repeat for `genTextMessages` if it has a similar issue
(check it — last time I looked it just calls `generateText`, which doesn't
have the same problem).

---

## 2. Bump the `ai` peer dependency

**File:** `package.json` of the `values-tools` repo.

`moral-graph-elicitation` is moving to `ai@^6`. Make sure `values-tools`
declares a compatible peer range so npm/bun don't warn or refuse to
install it alongside.

Current (likely):

```json
{
  "peerDependencies": {
    "ai": "^3.0.0"
  }
}
```

Change to (whichever range is appropriate — the `mode: "json"` fix above
works in `ai@3`, `4`, `5`, and `6`, so a wide range is fine):

```json
{
  "peerDependencies": {
    "ai": ">=3 <7"
  }
}
```

Also bump the `ai` entry under `devDependencies` (used for building
values-tools itself) to a current version, e.g. `"ai": "^6.0.176"`. If
you're maintaining matching ai-sdk versions:

```json
{
  "devDependencies": {
    "ai": "^6.0.176",
    "@ai-sdk/anthropic": "^3.0.76",
    "@ai-sdk/openai": "^3.0.63",
    "zod": "^3.25.76"
  },
  "peerDependencies": {
    "ai": ">=3 <7",
    "@ai-sdk/anthropic": ">=3",
    "@ai-sdk/openai": ">=3"
  }
}
```

(If `values-tools` doesn't currently declare these as peer deps and just
imports from its own deps, that's fine — the repo's `dependencies` /
`devDependencies` dictate what the published package brings along.)

---

## 3. Verify locally

Inside the `values-tools` repo:

```sh
bun install
bun run typecheck   # or `tsc --noEmit` if no script — should be clean
bun run build       # if there's a build step
```

Then test by running any small script that calls `genObj` against a real
OpenAI model — confirm it doesn't throw.

---

## 4. Push to `main`

```sh
git add src/services/ai.ts package.json
git commit -m "Use mode='json' for generateObject; bump ai peer to support 6.x"
git push origin main
```

---

## 5. Pull the change into `moral-graph-elicitation`

In this repo:

```sh
bun update values-tools
```

If `bun update` doesn't actually re-resolve (it sometimes caches the
tarball SHA), force it:

```sh
rm -rf node_modules bun.lockb
bun install
```

Verify the fix landed:

```sh
grep -n 'mode:' node_modules/values-tools/src/services/ai.ts
# Should print: mode: "json",
# (not: mode: "auto",)
```

Commit the lockfile bump:

```sh
git add bun.lockb package.json
git commit -m "Bump values-tools (mode='json' fix + ai@6 peer)"
```

---

## After this is done

The `genObj` failures in Inngest go away. The `gen-seed-contexts`,
`find-new-contexts`, and other generation/dedup runs will succeed again.

If you also did the optional parameter fix, our code can call
`genObj({ …, mode: "tool" })` for cases where tool-mode structured output
is preferable (none in the current codebase, but useful future-proofing).
