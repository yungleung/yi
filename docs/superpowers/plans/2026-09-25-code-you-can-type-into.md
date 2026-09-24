# Code You Can Type Into

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P23 measured the one place typing is still slow — a keystroke inside a fenced code
block costs **34 ms** on a 4.7 KB block against 1–5 ms for text — and named the design: write
the text and re-render *that one span* in place instead of replacing the block. This phase
builds it for code, the kind that measured worst and that a notes app holds most of.

**Architecture:** the fast path has two halves, and this phase adds a second *kind* of write
beside the plain one. The rule (`syntax/plain_edit.ts`) is unchanged and already accepts a
letter inside a code block; what refused it was the write half's demand for one tagged text
node. So: `applyEdit` learns a second attempt — a *code write* — that verifies the block is
code whose rendered text is the document's own characters one for one, applies the edit,
re-runs highlight.js into the element that is already in the page, puts the caret back by
character offset, and measures the block. Nothing is replaced, so nothing is laid out again:
by P7's breakdown that invalidation is ~20 of the 34 ms.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, highlight.js, Node 20+.

**Spec:** P23's handoff (`docs/superpowers/plans/2026-09-25-where-typing-is-slow.md`) and
`docs/roadmap.md`'s item, renamed below.

## Global Constraints

- **The rendering stays a pure function of the block's source.** The code write re-runs the
  same renderer the first render used (`nodes/code_block.ts`); nothing else may highlight.
- **It may refuse, it may not be wrong.** The write happens only when the element's rendered
  text equals the block's own content (fences stripped for a fenced block) one for one, and
  when the edit lies *inside* that content — an edit in the fence line itself changes the
  language, which is a re-render of the block, not a write.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` stays green on a
  freshly started app; the new probe stays inside the bridge's 5 s budget.
- Commit style: `feat(…): …`, `test(…): …`, `docs: …`, and a `merge:` commit.

---

## Part 1 — the measurement this is for

From P23's probe, one letter, freshly started app:

| Case | Path | Keystroke | Detached build (highlight.js + DOM) |
| --- | --- | --- | --- |
| fenced code, one line | ordinary | 8 ms | 1 ms |
| **fenced code, 4.7 KB / 80 lines** | **ordinary** | **34 ms** | **7–17 ms** |

The detached build is the floor for a write that re-renders the markup in place (no swap, no
page layout, no parse of the block): 7–17 ms of highlight.js for that block, against 34 ms
for the rebuild — so the win is 2–3×, and it is bounded by the highlighter, not by the
editor. Re-highlighting only when a burst stops (the deferred check's pattern) would take the
keystroke to ~2 ms but put unhighlighted code on screen while the author types, which is a
visible change this phase does not make; it is recorded, not built.

## Part 2 — the design

1. **`syntax/markers.ts: fenceContent(text)`** — the lines between a fenced block's delimiter
   lines, or null. The one fact about what a code block's *content* is, beside
   `openingFence`/`closingFence`, which already say what its delimiters are.
2. **`nodes/code_block.ts: renderCode(code, text)`** — the highlight call, exported and used
   by the constructor too, so the second render is the first render. It reads the language
   from the element's own class (`language-js`), which the first render put there.
3. **`caret/offsets.ts: positionInElementAt(element, offset)`** — a DOM position for a
   character offset in an element's rendered text, the inverse of the `textOffsetInElement`
   that is already there. No parse: the walk is over the element's text nodes.
4. **`editing/context.ts`** — a second attempt beside the plain one: `codeRun(state, root,
   from, to)` returning the block, its `<code>` element and whether the edit is inside the
   content. `applyEdit` uses it when the plain write refused, and the branch mirrors the
   plain one: hold the shown-source decision, write, re-render that element, put the caret
   back, measure the block, keep the scroll.
5. **`virtual_block_renderer.ts: elementFor(lineStart)`** — the element a mounted block is
   drawn by. The renderer owns which blocks are mounted; `mounted` is private and the write
   path should not go looking for a `[data-line-start]` in the page instead.

---

## Part 3 — tasks

### Task 1: the code write

**Files:**
- Modify: `src/ui/markdown/syntax/markers.ts`
- Modify: `src/ui/markdown/nodes/code_block.ts`
- Modify: `src/ui/markdown/caret/offsets.ts`
- Modify: `src/ui/markdown/virtual_block_renderer.ts`
- Modify: `src/ui/markdown/editing/context.ts`
- Modify: `test/checks/check-code-edits.mjs` (cases for `fenceContent`)

- [ ] **Step 1: `fenceContent`, with its cases first.** The check's cases fail before the
  helper exists: a fenced block, an indented block (null — its content is the whole text),
  an unterminated fence, and a fence whose content is empty.

- [ ] **Step 2: The pieces** (`renderCode`, `positionInElementAt`, `elementFor`).

- [ ] **Step 3: The attempt in `applyEdit`**, refusing unless: the block is a code block, the
  element is mounted, its rendered text equals the content one for one, and the edit's range
  lies inside the content.

```bash
npx tsc --noEmit && npm run check
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/markdown/syntax/markers.ts src/ui/markdown/nodes/code_block.ts \
  src/ui/markdown/caret/offsets.ts src/ui/markdown/virtual_block_renderer.ts \
  src/ui/markdown/editing/context.ts test/checks/check-code-edits.mjs
git commit -m "feat(typing): a keystroke in a code block re-renders the code, not the block"
```

### Task 2: the proof, in the app

**Files:**
- Add: `test/probes/code-typing.js`
- Modify: `test/README.md` (the count and the new name)

- [ ] **Step 1: The probe.** A fenced code block:
  1. a letter typed inside a line keeps the block **and** the `<code>` element (the write),
     keeps its highlighting, reaches the document, and leaves the caret after the letter —
     checked the only way a caret can be, by typing again and reading where it landed;
  2. the same letter is a *rebuild* when the caret is in the fence line itself (the language
     is part of the delimiter), so the refusal is visible rather than assumed;
  3. a keystroke in an indented code block is the write too (its content is the whole text).

```bash
npm run probe -- --fixture default-document.md test/probes/code-typing.js
npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" \
  test/probes/typing-cost-by-kind.js
```

- [ ] **Step 2: Commit**

```bash
git add test/probes/code-typing.js test/README.md
git commit -m "test(typing): a keystroke in a code block"
```

### Task 3: Acceptance, docs, handoff

- [ ] **Step 1: The docs**

`docs/architecture.md`: the fast path has two writes now, and which blocks each covers.
`docs/roadmap.md`: the item closes for code and names what is left (the other highlighted
renderings — display and inline math, a revealed source — and Enter inside code, which the
line-edge guard refuses because it lands at a line's end).
- [ ] **Step 2: Acceptance**

```bash
npx tsc --noEmit
npm run check                                   # 22/22 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 77/77 probes, 7 skipped
```

- [ ] **Step 3: The handoff, and the commit**

```bash
git add docs/architecture.md docs/roadmap.md \
  docs/superpowers/plans/2026-09-25-code-you-can-type-into.md
git commit -m "docs: close the code-you-can-type-into handoff"
```

- [ ] **Step 4: Merge**

```bash
git checkout main
git merge --no-ff codex/code-write -m "merge: a keystroke in a code block re-renders the code (typing)"
git rev-parse HEAD^{tree} codex/code-write^{tree}   # must be equal
```

Keep the branch, and report the tree hash.
