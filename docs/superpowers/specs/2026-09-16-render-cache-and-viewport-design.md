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

### 2. Viewport compensation

Before a re-sync touches the DOM, the renderer records the block at the top of
the viewport and its offset from the scroller's top. After the re-sync (and
after the spacers are resized), it finds that block again — the same node when
it survived, otherwise the nearest mounted block — and adjusts `scrollTop` by
the change in its offset. The reader keeps the line they were looking at.

This is what makes any height change invisible: a placeholder height replaced
by a measurement, an edit that splits a block, undo and redo of either. It never
scrolls the caret into view (that stays in the caret layer) and it does nothing
when the offset did not change.

## Non-goals

- No eager rendering or eager measurement; the load cost of the big documents
  stays where it is.
- No change to the caret layer beyond the scroll timing already landed.
- Incremental history is *enabled* but not part of this change: replacing
  snapshots with edits, and invalidating only the blocks a change overlaps, is
  the next step once these caches stop missing.

## Verification

- `scripts/probes/edit-stability.js` (new): after a line-shifting edit, report
  how many rendered elements survive and how far the viewport anchor moved.
  Expected: most elements survive (was 1 of 28) and the anchor moves ≈ 0px.
- `scripts/probes/block-gaps.js`, `scripts/probes/footnote-enter.js` (existing):
  still no tight gaps, and the footnote line no longer moves when Enter is
  pressed.
- The large-document round trip (open the math document, scroll far away and
  back): the block that left the window comes back as the **same** element
  (measured `sameNode: false` before this change).
- `npx tsc --noEmit`, `scripts/check-blocks.mjs`, `scripts/check-enter.mjs`.
