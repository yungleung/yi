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

## Part 1 — the measurement this was for

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

## Part 2 — the design, and what happened to it

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

**All five were built, and then measured out.** The write worked — a keystroke inside a
fenced code block kept the block element, kept the `<code>` element and its highlighting, and
put the caret where the next character went (`test/probes/code-typing.js`, which was written
for it and then removed with it). What it did not do is cost less:

| Big fenced code block, one letter, first line (same position both ways) | |
| --- | --- |
| with the write | 31 ms, block and code element kept |
| without it, the rebuild as before | 25 ms, block replaced |

Within the noise of single keystrokes the two are the same, and that is the finding: the cost
is **the layout the block's markup invalidates**, and replacing the `innerHTML` of a `<pre>`
invalidates exactly what replacing the element did. Highlight.js is only 5–8 ms of it. So the
implementation was reverted, and what a future phase should try instead is the other shape:
write the character into the text node *inside* the highlighted span that holds it (the plain
write's own 0–1 ms patch) and re-highlight once the burst stops — the deferred-check pattern —
which trades a stale highlight for the duration of a burst against the whole cost. That is a
visible change and needs a decision of its own, not a quiet one here.

Two smaller things came out of building it, and both are kept:

- The measurement probe was measuring the wrong place: a block 80 lines deep has most of
  itself below the window, so the click in its fortieth line landed on a rect outside the
  viewport, the caret fell back to the block's start, and the rule refused *there* — the
  probe was timing the ordinary path for a reason that had nothing to do with the keystroke
  it meant to measure. It types into the first line now.
- The detached build's cost, so the floor is in the probe's own report beside the keystroke's.

---

## Part 3 — tasks, as they turned out

### Task 1: build the write, measure it, and revert it

- [x] The five pieces (§Part 2) were written: `fenceContent` with its check cases,
  `renderCode`, `positionInElementAt`, `elementFor`, and the second attempt in `applyEdit`.
  Two things had to be got right on the way, both worth remembering: a block is a *view* whose
  offsets are derived on demand (`document/block_index.ts`), so the write has to carry plain
  numbers rather than the pre-edit block; and Vite can serve a module the file on disk no
  longer holds (`docs/testing.md`), which made an import come back `undefined` and cost an
  hour of looking in the wrong place.
- [x] The probe for it (`code-typing.js`) passed: the block, the `<code>` element and the
  highlighting all survived a keystroke, the letters reached the document in order, and a
  caret at the start of a code line still rebuilt the block (the rule's line edge).
- [x] Then the like-for-like measurement: **25 ms for the rebuild, 31 ms for the write.**
- [x] All of it reverted, with the finding recorded above and the probe removed with it.

### Task 2: what is kept

**Files:**
- Modify: `test/probes/typing-cost-by-kind.js`

- [x] The probe types into the *first* line of the big block (its fortieth is below the
  window, and the click there landed nowhere), and reports the detached build beside the
  keystroke so the floor is visible in the same report.

- [ ] Commit

```bash
git add test/probes/typing-cost-by-kind.js
git commit -m "test(probes): measure the code block where the click lands, and the floor"
```

### Task 3: Acceptance, docs, handoff

- [x] **The docs**: `docs/roadmap.md` records the measurement and the shape of the next
  attempt (a local write into the highlighted span, re-highlighted when the burst stops), and
  `docs/architecture.md` keeps its note about which kinds never take the fast path — because
  after this phase that is still every raw one.
- [ ] **Acceptance**

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

---

## Handoff — what this phase left

**A design that was built, measured, and reverted — which is the result.** The roadmap named
"write the text and re-render that one span in place" as the way to make a keystroke in a
code block fast. It works, and it does not help:

| Big fenced block, one letter, same place both ways | |
| --- | --- |
| the write in place | 31 ms, block and `<code>` element kept, highlighting kept |
| the rebuild as before | 25 ms, block replaced |

The cost is the layout the block's *markup* invalidates, and swapping a `<pre>`'s
`innerHTML` invalidates the same thing as swapping the element; highlight.js is only 5–8 ms
of the 25–34. No editor code from this phase is on `main`.

### What is kept

- `test/probes/typing-cost-by-kind.js` types into the big block's **first** line (its
  fortieth is below the window; the click there landed on a rect outside the viewport, the
  caret fell back to the block's start, and the rule refused *there* — the probe had been
  timing the ordinary path for a reason that had nothing to do with the keystroke) and reports
  the **detached build** beside the keystroke, so the floor is visible in the same report.
- `docs/roadmap.md` carries the numbers and the shape of the next attempt.

### The next attempt, named

Write the character into the text node *inside* the highlighted span that holds it — the
plain write's own 0–1 ms patch — and re-highlight once the burst stops, the way the deferred
check already parses once a burst. That trades a stale highlight for the length of a burst
against the whole cost, so it is a *visible* change and needs a decision of its own; the
measurement to make first is what a stale highlight looks like on the screen while typing.

### Two things worth remembering from building it

- A block is a **view** whose offsets are derived on demand (`document/block_index.ts`): a
  write that holds the pre-edit block and reads `charStart` after the edit throws "this block
  is not in the index". Carry plain numbers across an edit.
- Vite can serve a module the file on disk no longer holds (`docs/testing.md`): an import came
  back `undefined` and cost an hour of looking in the wrong place. `touch` and `--reload`.

### Evidence

- `npx tsc --noEmit` clean; `npm run check` **22/22**; a freshly started app and
  `npm run probe:all`: **76/76 probes, 7 skipped**.
- The write's own probe passed before it was reverted (block, code element and highlighting
  kept; letters in order; a caret at a code line's start still rebuilt). Its numbers are in
  the table above and nowhere else.
