# The Spans Behind the Layout

**Goal:** the measurement P28's handoff asked for. A code block's keystroke is 31 ms and
effectively all of it is the block being rebuilt and laid out again; both write designs avoided
the rebuild and still cost ~28 ms, which leaves that layout. An 80-line block carries a few
hundred highlight spans and a paragraph carries one line, so the question is whether the spans
are what the layout is spending its time on.

**Architecture:** one probe, no editor code. It patches a text node inside the element and
forces a layout (a height read, as `measureEditedBlock` does), five times, for the same
characters rendered two ways: as highlight.js left them, and as one plain text node. Nothing
touches the document — the app's state keeps the text it had — so this measures the layout and
nothing else.

**Spec:** P28's handoff (`2026-09-25-keystroke-parts.md`) and the roadmap's "Where a code
block's keystroke goes".

## Global Constraints

- **Read the write figure carefully.** P26 measured "a text node and one height read" at 2–4 ms
  and the app's own path at 28; a forced layout can be answered from a layout the browser has
  not re-run. The probe therefore patches and reads *five times in a row* per variant and
  reports every round, so a first-round artefact cannot be mistaken for a result — and it leans
  on the *comparison* between the two variants, which share whatever the artefact is.
- No editor code changes; `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all`
  stays green on a freshly started app.

## Part 1 — what the probe reports

Per variant (spans, one text node), per round: the patch and the forced layout together, then
the median. The same measurement on a paragraph is the control.

**The decision this feeds.** If the spans are the cost, the design is about the markup — fewer
spans, or no highlighting while a burst runs, which P26 put numbers on (invisible for ordinary
typing; a delimiter's tail shows for ~200 ms). If they are not, a code block's layout is
intrinsic to its size and shape and the honest answer is to accept the cost and close the
neighbourhood.

## Part 2 — tasks

- [x] The probe (`test/probes/code-markup-layout.js`) and its README entry.

## What was measured

Every round is the same tiny edit — a character into a text node — plus the height read that
forces the layout, five times, on an 80-line block:

| The element's markup | Rounds (ms) | Median | Elements |
| --- | --- | --- | --- |
| as hljs leaves it — one inline flow, 160 spans | 25, 18, 16, 16, 17 | **17 ms** | 160 |
| each line its own block box, spans kept | 28, 8, 9, 8, 8 | **8 ms** | 240 |
| the same characters as one text node | 2, 1, 1, 0, 1 | **1 ms** | 0 |
| a paragraph of the same length | 1, 0, 1, 0, 0 | **0 ms** | 2 |

So the spans *are* the layout's cost, and half of it is the fact that they are one inline
flow: putting each line in a block box of its own costs 240 elements instead of 160 and still
halves the layout, with the characters and classes untouched.

## What came of it

The per-line rendering was built (`nodes/code_block.ts: wrapLines`, called from the highlight
call so the first render and any refresh both wrap) and then **reverted**: the app's keystroke
is a *rebuild*, and a rebuild lays a fresh element out in full, where per-line boxes change
nothing (30 ms, unchanged). It halves the layout of a change *in place* — which is the shape a
write would have, and the write itself is measured out (P27: 28 ms).

So the neighbourhood is closed to one option, and it is a visible one: no highlighting while a
burst runs (1 ms a keystroke in the unhighlighted state, colours restored when the typing
stops). The roadmap says so, and the decision is the user's.

```bash
npx tsc --noEmit
npm run check                                   # 22/22 checks
npm run probe -- --fixture default-document.md test/probes/code-markup-layout.js
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 79/79 probes, 7 skipped
git checkout main
git merge --no-ff codex/span-layout -m "merge: the spans behind the layout, measured (typing)"
git rev-parse HEAD^{tree} codex/span-layout^{tree}   # must be equal
```
