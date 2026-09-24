# Where Typing Is Slow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the roadmap's "measure before deciding" column asked whether the ordinary path's
parse is worth attacking. Measured by *block kind*, the question turns out to be a different
one: the fast path covers every kind whose text renders as text, and nothing that renders as
**highlighted source** — a fenced code block, a display formula, a revealed link — takes it
at all, on any keystroke.

**Architecture:** a measurement, not a change. `test/probes/typing-cost-by-kind.js` types one
letter in the same place in each kind and reports the cost, the path and the geometry reads;
the roadmap's item and `docs/architecture.md` are corrected by what it found.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** `docs/roadmap.md` → "Measure before deciding".

## Global Constraints

- Nothing in the editor changes: the deliverable is the measurement, the standing probe, and
  the judgement it changes.
- The probe must stay inside the bridge's 5 s budget (it is 4.3 s: seven cases, short
  sleeps, one load each).
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` stays green on a
  freshly started app.
- Commit style: `test(probes): …`, `docs: …`, and a `merge:` commit.

---

## Part 1 — what was measured

One letter typed inside a word, one case per block kind, same caret position (two characters
into the word), on a freshly started app:

| Block kind | Path | Cost | Geometry reads |
| --- | --- | --- | --- |
| paragraph | fast | 2 ms | one height |
| heading | fast | 1 ms | one height |
| list item | fast | 1 ms | one height |
| table cell | fast | 3 ms | one height |
| fenced code (one line) | ordinary | 6 ms | one height |
| **fenced code (4.7 KB, 80 lines)** | **ordinary** | **32 ms** | one height |
| display math | ordinary — its source is highlighted, so no single text node holds the word | — | — |

Two things follow.

**The rule is not what refuses code.** `syntax/plain_edit.ts` accepts a letter inside a code
block's line (it is an ordinary line of text with plain characters around it). What refuses is
the *write* half: `editing/typed_text.ts` needs the caret's own characters in **one text node
inside a tagged span**, and a code block is rendered by highlight.js — many spans, no tag. The
same is true of every kind the app renders as source: display math (`nodes/math.ts`), inline
math, a revealed link, an image's source, HTML and frontmatter.

**The cost is the rebuild, and it scales with the block.** 32 ms per keystroke on a 4.7 KB
code block against 1–3 ms for text — the same shape P7 measured for paragraphs before the
fast path existed (rebuild + layout ≈ 30 ms of it, parse ≈ 10 ms). Code is exactly the kind
of block a notes app holds a lot of, and it is the one an author types *into* for a while.

## Part 2 — the judgement

- The roadmap's "ordinary path's parse" item was written about *structural* keystrokes (`*`,
  `#`, a line edge), which are one-off events. The measurement says the cost that matters is
  continuous: every keystroke inside a raw block.
- Making a raw block fast is **not** a parser or caret tweak: it needs a path that writes the
  text and re-renders *that one span* (highlight.js again, in place) instead of rebuilding the
  block element, then puts the caret back by offset. The saving that suggests is the DOM swap
  and its layout invalidation (~20 of the 32 ms, by the same breakdown P7 measured for
  paragraphs), which is worth a design of its own — and a measurement of the re-highlight
  cost first.
- So the item stays open, sharpened, with numbers, and the *next* phase is that design; no
  code in this one.

---

## Part 3 — tasks

### Task 1: the measurement, standing

**Files:**
- Add: `test/probes/typing-cost-by-kind.js`
- Modify: `test/README.md` (the probe count and the new name)

- [x] **Step 1: The probe**, as implemented: seven cases, the path (block survived or was
  rebuilt), the millisecond, the geometry reads, and the block's height change.

```bash
npm run probe -- --fixture default-document.md test/probes/typing-cost-by-kind.js
```

- [x] **Step 2: Commit**

```bash
git add test/probes/typing-cost-by-kind.js test/README.md
git commit -m "test(probes): what a keystroke costs, by block kind"
```

### Task 2: Acceptance, docs, handoff

- [x] **Step 1: The docs**

`docs/roadmap.md`: the "ordinary path's parse" item is rewritten with the table above and the
named next step. `docs/architecture.md`'s "One keystroke" passage says which kinds never take
the fast path and why (the write half needs one tagged text node).

- [x] **Step 2: Acceptance**

```bash
npx tsc --noEmit
npm run check                                   # 22/22 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 76/76 probes, 7 skipped
```

- [x] **Step 3: The handoff, and the commit**

```bash
git add docs/roadmap.md docs/architecture.md \
  docs/superpowers/plans/2026-09-25-where-typing-is-slow.md
git commit -m "docs: close the where-typing-is-slow handoff"
```

- [x] **Step 4: Merge**

```bash
git checkout main
git merge --no-ff codex/typing-by-kind -m "merge: where typing is slow, measured (probes)"
git rev-parse HEAD^{tree} codex/typing-by-kind^{tree}   # must be equal
```

Keep the branch, and report the tree hash.

---

## Handoff — what this phase left

**The measurement changed the question.** The roadmap asked whether the ordinary path's
*parse* was worth attacking, on the numbers P7 left (9 ms of ~40 ms for a structural
keystroke). Typed by kind, the cost that matters is not the occasional `*` or `##` — it is
**every keystroke inside a block the app renders as source**, and the rule is not what
refuses those.

### The table

One letter, two characters into a word, one case per kind, freshly started app:

| Block kind | Path | Cost | Reads |
| --- | --- | --- | --- |
| paragraph | fast | 2 ms | one height |
| heading | fast | 1 ms | one height |
| list item | fast | 1 ms | one height |
| table cell | fast | 3 ms | one height |
| fenced code, one line | ordinary | 6 ms | one height |
| **fenced code, 4.7 KB / 80 lines** | **ordinary** | **32 ms** | one height |
| display math | ordinary — highlighted into many nodes, so no single text node holds the word | — | — |

### What that means

`syntax/plain_edit.ts` *accepts* a letter inside a code block's line; the refusal is in the
**write** half (`editing/typed_text.ts`), which needs the caret's characters in one text node
inside a tagged span. Every raw rendering is many nodes or none: highlight.js spans for a
fenced block and a formula, a revealed source span for a link, an image's source, HTML,
frontmatter. So those kinds rebuild the block per keystroke, and the rebuild scales with the
block — 32 ms on 4.7 KB, which is the shape P7 measured for paragraphs before the fast path
existed (rebuild + layout ≈ 30 ms, parse ≈ 10 ms of it).

### The next phase, named

A raw block that is fast would need a path that writes the text and re-renders **that one
span** in place — highlight.js again for a code block — then puts the caret back by offset,
instead of rebuilding the block element. By P7's breakdown the swap and its layout are ~20 of
the 32 ms, so a 2–3× win is the plausible ceiling; it needs its own design (what counts as a
raw block, how large is too large to re-highlight, what the deferred check does) and a
measurement of the re-highlight itself before any of it is written. That is the honest next
step, and this phase deliberately wrote no editor code.

### Evidence

- `npx tsc --noEmit` clean; `npm run check` **22/22**.
- A freshly started app and `npm run probe:all`: **76/76 probes, 7 skipped**, with the new
  probe in the suite (`the probe itself 3557 ms`, inside the bridge's 5 s budget).
- The probe's own first version was wrong and is worth remembering: it found its block again
  by `textContent.includes(needle)`, and the needle is what the typed letter is *inside*, so
  every kind reported "ordinary" — including a paragraph, which is the one thing the fast
  path is known to cover. It looks the block up by `lineStart` now.
