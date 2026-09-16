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
- `scripts/probes/jump-report.js`: the reported flow (end of the document,
  back to the footnote, Enter) moves the footnote **2px** after §2 (485px
  before it).
- `npx tsc --noEmit`, `scripts/check-blocks.mjs`, `scripts/check-enter.mjs`.
