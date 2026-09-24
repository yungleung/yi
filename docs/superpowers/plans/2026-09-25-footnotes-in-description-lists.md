# Footnotes in Description Lists

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the boundary P18 left. A footnote *reference* in a description term or detail
renders as its own text today — `[^1]` where the author wrote a reference — because those
are re-parsed as fragments and a fragment has no definitions in it. A whole block borrows
them (`state.ts` through `withFootnoteDefinitions`) and drops the nodes they add; the
fragment re-parse does not.

**Architecture:** the borrowing is already the app's one answer to "markdown reads a
reference only when its definition is in the same parse", and it lives in
`syntax/footnotes.ts`. So the fragment re-parse borrows the same way, and the rule that
says which nodes came from the borrowed text (they start past the caller's own text) moves
next to it — one home, used by the block parse and the fragment parse both.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** "What is left" in `docs/superpowers/plans/2026-09-24-description-list-nodes.md`
and `docs/roadmap.md`.

## Global Constraints

- The borrowed text is *context*, never content: it may not add a node to what the
  renderer sees, and it may not move any offset the fragment's own nodes carry.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` stays green on a
  freshly started app.
- Commit style: `feat(…): …`, `test(…): …`, `docs: …`, and a `merge:` commit.

---

## Part 1 — the design

### 1.1 Where a reference is read

`[^1]` parses as a `footnoteReference` only when `[^1]: note` is in the same parse. A
block gets that context in `state.ts: getBlockContent`, by parsing
`withFootnoteDefinitions(prepared, labels)` and filtering out the nodes past
`prepared.length`. A description term or detail is re-parsed by
`parser.ts: reparseDescriptionContent` from its *source line* — a fragment — with no such
context, so the reference stays the text `[^1]`.

### 1.2 The change

`reparseDescriptionContent` takes the document's footnote labels and parses its fragment
the way a block is parsed:

```ts
  const withContext = withFootnoteDefinitions(source, definitions);
  const root = fragmentProcessor.runSync(fragmentProcessor.parse(withContext)) as Root;
  const children = root.children
    .filter((child) => isOwnNode(child, source.length))
    .flatMap((child) => (child.type === 'paragraph' ? (child.children ?? []) : [child]));
```

The positions are shifted as they are today, so the borrowed lines (which sit past
`source.length`) never reach the renderer and never move the offsets.

The filter is lifted out of `state.ts` into `syntax/footnotes.ts` as `isOwnNode`: the fact
belongs with `withFootnoteDefinitions`, which is what makes it true, and both callers now
read it from there. `fixDescriptionPositions` computes the labels once per parse, from the
markdown it was handed — the same set a whole block would borrow from.

---

## Part 2 — tasks

### Task 1: the reference comes back

**Files:**
- Modify: `src/ui/markdown/syntax/footnotes.ts`
- Modify: `src/ui/markdown/syntax/parser.ts`
- Modify: `src/ui/markdown/document/state.ts`
- Modify: `test/checks/check-parser.mjs`

**Interfaces:**

- Produces: `footnotes.ts: isOwnNode(node, length)`; `reparseDescriptionContent` gains a
  definitions argument. `state.ts`'s private `isOwnContent` goes away.

- [ ] **Step 1: The shared rule**

`isOwnNode` in `footnotes.ts`, with the comment saying what it is for (the borrowed
definitions start past the text the caller parsed), and `state.ts` calling it.

- [ ] **Step 2: The fragment borrows**

`fixDescriptionPositions` computes `footnoteLabels(markdown)` once and passes it down;
`reparseDescriptionContent` parses `withFootnoteDefinitions(source, definitions)` and
filters with `isOwnNode`.

- [ ] **Step 3: The check**

`check-parser.mjs`'s footnote case flips: the term and the detail assert the reference
*node* comes back with its source, instead of asserting it stays text. The case's
comments (in the file and in the corpus) stop calling it an exception.

```bash
npm run check
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/markdown/syntax/footnotes.ts src/ui/markdown/syntax/parser.ts \
  src/ui/markdown/document/state.ts test/checks/check-parser.mjs
git commit -m "feat(parser): a footnote reference in a description list"
```

### Task 2: the same thing in the app

**Files:**
- Modify: `test/probes/description-list.js`

**Interfaces:**

- Produces: a case in the probe that a reference in a detail renders as a reference, and
  that the definition is *not* rendered inside the list.

- [ ] **Step 1: The probe case**

A document with a description list whose detail cites a footnote defined below it: the
detail renders the reference widget (`[data-footnote-ref]`) and the definition line stays
its own block. Typing after the reference still lands where the document says.

```bash
npm run probe -- --fixture default-document.md test/probes/description-list.js
```

- [ ] **Step 2: Commit**

```bash
git add test/probes/description-list.js
git commit -m "test(parser): a footnote reference in a description list"
```

### Task 3: Acceptance, docs, handoff

- [ ] **Step 1: The docs**

`docs/roadmap.md` closes the boundary P18 named; the plan's handoff records what the
fragment parse borrows now.

- [ ] **Step 2: Acceptance**

```bash
npx tsc --noEmit
npm run check                                   # 21/21 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 74/74 probes, 6 skipped
```

- [ ] **Step 3: The handoff, and the commit**

```bash
git add docs/roadmap.md docs/superpowers/plans/2026-09-25-footnotes-in-description-lists.md
git commit -m "docs: close the footnote in a description list handoff"
```

- [ ] **Step 4: Merge**

```bash
git checkout main
git merge --no-ff codex/footnotes-in-description -m "merge: a footnote reference in a description list (parser)"
git rev-parse HEAD^{tree} codex/footnotes-in-description^{tree}   # must be equal
```

Keep the branch, and report the tree hash.
