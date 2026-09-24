# Code You Can Type Into, For Real

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the win P26 measured and the user took: a keystroke inside a fenced code block goes
from 25–34 ms to 2–4 ms by writing into the highlighted text node, with the markup refreshed
when the burst stops. Ordinary typing is invisible (0 characters stale); a delimiter that
changes how the rest of the line reads shows the old colours for one burst (~200 ms).

**Architecture:** the fast path gains a *second place it can write*, not a second kind of
write. `editing/typed_text.ts: plainRun` refuses a code block because its text is highlight
spans, not one tagged node; `editing/code_write.ts: codeWriteFor` answers the same
`TypedRun` shape for a fenced block whose *element* holds the block's content one for one and
whose caret sits in one of its text nodes. From there the plain write does the work
(`writeRun`), the plain branch does the bookkeeping, and the only new thing is
`scheduleVerify`'s timer also re-running the highlighter when the burst stops — which is where
the repair belongs, because it is already one coalesced pass a burst.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, highlight.js, Node 20+.

**Spec:** P26's handoff (`2026-09-25-the-stale-highlight.md`) and the roadmap item it wrote.

## Global Constraints

- **The rendering stays a function of the document.** The refresh re-runs the same renderer
  the first render used (`nodes/code_block.ts: renderCode`), from the block's own text.
- **It may refuse, it may not be wrong.** A code write happens only when the element's text
  *is* the block's content (fences stripped, one for one) and both ends of the edit land in a
  single text node inside it — the same bar `plainRun` holds.
- **A block is a view**: its offsets are derived on demand (`document/block_index.ts`), so
  anything kept across an edit is a number, not the block.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` stays green on a
  freshly started app.
- Commit style: `feat(…): …`, `test(…): …`, `docs: …`, and a `merge:` commit.

---

## Part 1 — the design

1. **`syntax/markers.ts: fenceContent(text)`** — where a fenced block's content lies in its
   own text, or null. The one fact about what a code block's content *is*, beside
   `openingFence`/`closingFence`, which already say what its delimiters are. Cases first, in
   `test/checks/check-code-edits.mjs` (which already bundles the markers).
2. **`nodes/code_block.ts: renderCode(code, text)`** — the highlight call, exported and used
   by the constructor too, so the refresh is the first render. It reads the language from the
   element's own class (`language-js`), which the first render put there.
3. **`virtual_block_renderer.ts: elementFor(lineStart)`** — the element a mounted block is
   drawn by; the renderer owns which blocks are mounted.
4. **`editing/code_write.ts: codeWriteFor(state, renderer, root, from, to)`** — the same
   `TypedRun` the plain write returns, found the same way (`domPositionAtOffset`, which is a
   cache hit before the edit), with the two conditions above.
5. **`editing/context.ts`** — one extra attempt beside the plain one, and the branch they
   share; `scheduleVerify` gains a `rehighlight` flag, and its timer, after the shape check,
   re-runs `renderCode` over the block's element and puts the caret back by counting the
   element's own characters (`caret/offsets.ts: positionInElementAt`, the inverse of the
   `textOffsetInElement` already there).

## Part 2 — what happened

- [x] The write was built: `fenceContent` with its check cases, `renderCode`, `elementFor`,
  `positionInElementAt`, `codeWriteFor`, the second attempt in `applyEdit`, and the
  re-highlight riding `scheduleVerify`'s timer (one coalesced pass a burst).
- [x] The probe passed and proved all of it: a code keystroke takes the fast path, the block
  and its `<code>` element survive, the letters reach the document in order, a letter at a
  code line's start still rebuilds (the rule's line edge), a quote's markup is **stale until
  the burst stops** and then identical to a fresh render, with the caret surviving the
  repair (proved by typing the next character).
- [x] Then the number it was for: **28 ms, against the rebuild's 30 ms.** P26's simulation
  measured the patch alone and the browser answered its height read from a layout it had not
  re-run; the app's path also measures the block, restores the caret and lays the page out
  again. The write is therefore *equivalent in cost and worse in behaviour* (stale markup for
  a burst), so it was reverted, like P24's.
- [x] What is kept: the correction to P26's item in `docs/roadmap.md`, a warning in
  `code-local-write.js` that its `writeMs` is a floor rather than a forecast, and the next
  question — a code block's keystroke spends 15–30 ms on something that is neither the parse,
  nor the block swap, nor its horizontal overflow container (18 ms → 15 ms when forced
  visible by hand).

## Part 3 — evidence

```bash
npx tsc --noEmit            # clean
npm run check               # 22/22 checks
npm run probe:all           # 77/77 probes, 7 skipped (no code change ships)
```
