# Content-keyed render caches and viewport compensation

## Problem

The block renderer keeps two caches keyed by a block's **line number**
(`mounted`, `heights`) and the state keeps the parsed tree of a block keyed the
same way (`state.blockContent`). A block's line number changes when anything
above it changes, so a single edit invalidates work that is still valid:

Measured in the default document (28 blocks), pressing Enter once at the end of
the first paragraph: 28 of the 29 blocks afterwards have text that was already
there, yet only **1** of the 28 previously rendered elements is still in the
DOM — everything below the edit was rebuilt, KaTeX and highlight included.

The same shifting shows up as the page jump reported after Enter at a footnote:
the document's total height changes when a block's 60px placeholder height is
replaced by a measured one, or when an edit splits a block, and the reader's
scroll position is expressed in that changing coordinate space.

## Design

### 1. Caches keyed by content, not position

A block's rendering is a function of its own source and the session's global
inputs (the bibliography, the settings), never of where it sits. So:

- the parsed tree (`state.blockContent`) is keyed `kind:text`;
- the measured height (`renderer.heights`) is keyed `kind:text`;
- the built element is cached by that same key when its block leaves the
  window, and re-inserted when a block with that key returns.

Line numbers remain the way blocks are *listed*; they stop being the way
rendered work is *remembered*. A block that keeps its text keeps its parse, its
height and its DOM through edits above it, through undo, and through scrolling
away and back.

The element cache is bounded: entries not currently mounted are kept in an LRU
with a cap (a multiple of the mounted window, never fewer than 20), evicted
furthest-away first. `refresh()` (bibliography or settings changed) and
`render()` (a new document) drop it, because those are the only inputs a block's
source does not carry. `builtFrom` keeps doing what it does today: a block whose
text changed does not match its cached element and is built afresh.

Nothing becomes eager: only blocks the reader has actually seen are retained,
and the cap makes the memory predictable. The parse cache gets a cap too, since
each edit mints one new entry.

### 2. The scroll position is put back after an edit

The jump was not the spacers at all. A probe of the reported flow (jump to the
end of the document, back to the footnote, press Enter) reported `topSpacer: 0`,
`bottomSpacer: 0` and every block mounted — this document never virtualizes in
that window — while `scrollTop` moved 1176 → 691 and `targetY` 200 → 685: the
two cancel, so the content did not move in the document and *only the scroll
did*, well inside the maximum.

Trapping `scrollTop`'s setter plus `scrollTo`/`scrollBy`/`scrollIntoView` named
two movers: a scroll with **no JavaScript write at all** (the browser scrolling
the focused element or the synchronised native selection into view — nothing in
our code performs it or can see it), and then our caret layer following it with
its own scroll-into-view.

`applyEdit` therefore records the scroller's position before the edit and puts
it back two frames later, once the caret is placed and the browser has finished
scrolling whatever it decided to scroll — but only when the caret is visible at
that position, so an edit that moves the caret out of view still scrolls it in.
Measured with the probe above: the footnote moved **2px** (was 485px), with
`scrollTop` restored exactly to its previous value.

An earlier DOM-anchor compensation was implemented, measured (it moved the view
instead: `scrollTop` 909 → 600) and reverted; it is not part of this change.

## Non-goals

- No eager rendering or eager measurement; the load cost of the big documents
  stays where it is.
- No change to the caret layer beyond the scroll timing already landed.
- Incremental history is *enabled* but not part of this change: replacing
  snapshots with edits, and invalidating only the blocks a change overlaps, is
  the next step once these caches stop missing.

## Verification

- `scripts/probes/edit-stability.js` (new): after a line-shifting edit, report
  how many rendered elements survive. Measured **27 of 28** after the change
  (1 of 28 before it).
- `scripts/probes/block-gaps.js`: still `tight: []`.
- Maintainer-verified in their own window on
  `Geometric and Kinematic Foundations of Lagrangian Mechanics.md`: the
  re-rendering while scrolling is much lower than before the content-keyed
  caches — the case the probes could not reach, because this window's editor is
  tall enough that the default document never virtualizes.
- Maintainer-verified in the production build: scrolling is "a little slower
  than before, almost invisible". That is the caches' price — retaining
  rendered elements and a couple of map lookups per block that leaves the
  window — against their benefit, that a line-shifting edit or a scroll round
  trip rebuilds almost nothing (27 of 28 elements kept, and 0 rebuilt when
  scrolling back). The spare cap is twice the mounted window; halving it to
  once would still cover the blocks that just left, at half the retained DOM,
  if that price ever needs paying down.
- `scripts/probes/jump-report.js`: the reported flow (end of the document,
  back to the footnote, Enter) moves the footnote **2px** after §2 (485px
  before it).
- `scripts/probes/scroll-cost.js`: per-step settle time and rebuild count on a
  document that virtualizes, measured on the math document with a freshly
  started app: **86 / 138 / 262 ms** per 400px step, rebuilding 5–8 blocks per
  step. Two traps to be aware of when reading it: a webview whose window is not
  in the foreground throttles animation frames, so the probe now reports
  `settled: false` instead of a time; and a page that has been through many hot
  reloads and document loads reports steps that never settle at all.

### The shivering scrollbar (build)

Reported: in the production build, scrolling a math-heavy document shivers the
scrollbar and the content, most visibly backwards. Measured, scrolling six
400px steps with the document loaded directly:

| step | document height | mounted blocks |
| --- | --- | --- |
| down 1 | 8532 | 41 |
| down 2 | 8677 (+145) | 51 |
| down 3 | 8403 (−274) | 57 |
| back 1–3 | 8403 (stable) | 54 / 47 / 41 |

17 block heights changed across those steps, including `60 → 32` transitions —
the raw formula placeholder being replaced by the KaTeX rendering after the
block had already been measured. Two things follow, both fixed:

- a block's placeholder height was a flat 60px, nearly twice a typical block,
  so every block entering the window corrected the document's total by 20–30px
  and the scrollbar thumb re-scaled on each step. The estimate now comes from
  the block's line count (`lines × 24 + 8`), which is within a few pixels of the
  real height for text blocks;
- a re-mounted math node started on its raw source and swapped in the rendering
  a moment later, changing its height *after* the renderer had measured it.
  `cachedMath` now lets a node apply markup it has rendered before straight
  away, so only the first render of a formula goes through the placeholder.

### The content shivering while scrolling back (build)

Reported: in the build, scrolling a math-heavy document backwards shivers the
*content*. A per-frame sample of the topmost visible line during a backward
scroll shows no jitter in the dev window (one position for sixteen frames), so
this is timing-sensitive and only the maintainer can see it.

The mechanism it fits: blocks are `content-visibility: auto`, so a block that is
off-screen is laid out from its *intrinsic* size, and the stylesheet's fallback
is `auto 60px`. A heavy block therefore entered the window at 60px and took its
real height a frame later. That is a content shiver rather than a scrollbar one
— and it is biased towards scrolling *backwards*, because the blocks being
mounted then are *above* the viewport, so their expansion pushes the visible
content down, while blocks mounted below it expand harmlessly.

Each block's element is now seeded with `contain-intrinsic-size: auto <its
remembered height>` (the line-count estimate before it has ever been measured),
so it occupies its real height from the first frame it is in the document.
Verified in the dev window that the seeded sizes are the measured heights
(72 / 64 / 80 / 33px rather than 60), which is as far as a measurement can go
here.

**Maintainer-verified in the build: "much better now"** — the content shiver
while scrolling backwards is gone.

## Fixes found while measuring

Measured on the math document, loading it directly into the editor (a probe
with the document embedded avoids the file-tree navigation, which is what
wedges the dev page), 400px steps, `ms` to settle and blocks rebuilt:

| variant | down | back |
| --- | --- | --- |
| as landed | 110 / 195 (7 / 9 rebuilt) | 523 / 255 / 410 (0 rebuilt) |
| spare element cache disabled | 100 / 230 | 750 / 253 / 405 |
| heights measured once per width | 110 / 215 | 759 / 255 / 343 |
| window margin 1200 → 400 (≈45% fewer blocks mounted) | 96 / 281 | 436 / 235 / 211 |

None of the three levers moves the numbers beyond the run-to-run spread, so the
per-step cost is not the caches and not the measurement pass: it is the browser
laying out the window as it moves, in a document where every other block is
display math. The spare cache, the once-per-width measurement and the smaller
margin were all reverted — the first two because they changed nothing, the
third because a 400px margin risks visible blank space when a fast scroll
outruns it.

- `blockContentKey` caches the `kind:text` key per block object. Building that
  string copies the block's whole text, and the spacer arithmetic asks for a
  block's height several times per sync, so the first version of the
  content-keyed caches rebuilt and re-hashed the text of every block on every
  scroll step — the old key (`block.text`) was a string V8 had already hashed.
- `vite.config.ts` sets `server.forwardConsole` to errors only. KaTeX warns
  about LaTeX-incompatible input on every render of such a formula, and Vite's
  dev client forwards every client console call to the dev terminal, so a
  math-heavy document's scrolling produced a stream of websocket messages and
  terminal writes that the production build does not have.
- `npx tsc --noEmit`, `scripts/check-blocks.mjs`, `scripts/check-enter.mjs`.
