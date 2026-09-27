# The Editor Becomes a Page of A4

**Goal:** the user's ask — *"make editing feel like on a book page. Set the editor's size
like an A4 paper, and the content or the words sit at the paper's center and have standard
left/right margin like printed A4 spec."*

**Spec:** the user's message and the agreed design; the branch is `codex/a4-page` and the
user reviews before any merge.

## Why the measure is the point

Measured in the running app before the change: the pane is 994 px, the prose column
**962 px — 254 mm — and 151 characters a line** at 16 px Crimson. A book is 60–75. The sheet
is what fixes it: 210 mm of paper with a 25 mm margin leaves a 160 mm text column, which is
**95 characters a line** — long, and honest A4 (a real A4 at 12 pt runs that long; it is why
books use narrower pages). The design puts the A4 spec in first, and the type size is the
lever if the user wants the book measure instead.

## What this does

1. **The page.** `.markdown-page` on the prose root: `box-sizing: border-box`,
   `width: calc(210mm * var(--page-scale))`, `max-width: none` (the typography plugin caps
   `.prose` at `65ch`, and the old `w-full max-w-full` was what lifted that cap),
   `min-height: calc(297mm * var(--page-scale))` so a short note is still a page,
   `padding: calc(25mm * var(--page-scale))` — the printed margin, all four sides — and
   `margin-inline: auto`. The root's class list in `virtual_block_renderer.ts` swaps
   `w-full max-w-full` for `markdown-page`.
2. **The desk.** `.markdown-scroller` takes the desk: `padding: 1.5rem` (the space around
   the sheet, replacing the `p-4` in the class list) and `background-color:
   var(--color-base-200)`, with the page `base-100`, a hairline `base-300` edge and a soft
   shadow mixed from `base-content`. All theme tokens, so the page flips with the theme.
3. **The scroll on open.** A document opens at the top of its own page
   (`markdown_editor.ts: setContent`), which is a fix the page made necessary: the view
   keeps its scroll through an edit — right, an edit is not a request to move the page — and
   that was enough before because a short document was shorter than the pane and the browser
   clamped the old scroll away. A fixed 297 mm sheet is taller than the pane, so nothing
   clamps, and opening a note from a scrolled one left the reader on the middle of the paper
   with its words above the window. Three probes caught it (`footnote-jump`,
   `footnote-label-edge`, `undo-run-taken-back`).

## Tasks

- [x] Task 1: the probe — `test/probes/a4-page.js`: 210 mm wide, 297 mm tall, 25 mm of
      padding all round, a 160 mm text column, centred on the desk, `base-100` paper on a
      `base-200` desk in both themes, the measure held between 70 and 110 characters, and a
      click that still types where it lands.
- [x] Task 2: `.markdown-page` and the desk in `src/styles.css`; the root's classes in
      `virtual_block_renderer.ts`; the scroller's padding in `markdown_editor.ts`.
- [x] Task 3: the scroll on open, and the suite green again.
- [x] Task 4: acceptance and docs — `npx tsc --noEmit`, `npm run check`,
      `npm run probe:all`, `docs/architecture.md`, `docs/roadmap.md`, `test/README.md`.

## Second round, on the user's review

The first version held the sheet at its true A4 size and let a narrower pane scroll sideways.
The user asked for the other thing — *"Scale the paper size and font size"* — so the page now
fits the pane it is in: `markdown_editor.ts: fitPage` sets `--page-scale` to what is left of
the pane once the desk has its margin, capped at 1, and a `ResizeObserver` on the scroller
keeps it right when the window or the workspace tree changes size. The sheet, its margin and
its type all take that one scale (`.prose.markdown-page { font-size: calc(1rem *
var(--page-scale)) }` — the `.prose` in the selector is doing work, because the typography
plugin sets `font-size: 1rem` on `.prose` itself and the rest of its `em` sizes hang off it).
Measured in a 600 px pane: a 552 px page with a font of 11.13 px, the margin still 25/210 of
the paper, and no sideways scroll. The measure stays 95 characters a line at every scale,
because the scale is uniform.

`test/probes/table-insert.js` needed one line changed for this, and it is worth knowing why:
it placed the caret with a click at 99% of the text's *width*, which skims the last glyph —
with the type scaled down, the same fraction lands a fraction of a pixel earlier, and the
caret went before the final `.` instead of after it. It now aims at the character
(`range` at the end of the leaf, click its rect), the way `insert-link.js` does, so no type
size can decide where it lands. It passes on both layouts.

## Third round, on the user's review

*"You should also scale the line spacings."* The type and the paper scaled; the space around
them did not. The page's rhythm is now written in the page's own scale: `.prose` defines
`--md-page-scale` (the scroller's `--page-scale`, or 1), and every step of the rhythm comes
off it — `--md-line`, the paragraph skip, the before/after steps of both heading sizes, the
space around a quote, a table or a code block, the gap between list items, a table cell's
padding, an empty line's height, the block-height estimates, and the spacing the nodes carry
themselves (a description list, a display formula's blank line, a revealed source, a
footnote's own line — which needed semantic classes, since Tailwind's fixed steps do not
follow a page down). Measured in a 600 px pane: 24 px of line height becomes 16.7 px, the
paragraph skip 8 px becomes 5.6 px, and the probe holds every step of the rhythm at
`at full size × the scale`.

Two app bugs surfaced, and the suite found both:

1. **A window change threw away the reader's selection.** The virtualiser re-anchors the caret
   after a rebuild, and `reanchorCaret` restored a caret even when the reader had something
   selected — so Select All followed by Copy came back empty (measured: the selection made by
   `select_all` was gone 40 ms later, and the copy with it). It now leaves a non-collapsed
   selection inside the prose alone; the remembered offset keeps the caret for when they click
   or type. `undo-after-scroll` is the probe that caught it.
2. **The height estimator had the line height in a second home.** `block_sizes.ts` estimated an
   unmeasured block as `lines × 24px + 8px` — the page's own numbers, in absolute pixels. With
   the page drawn at 57%, every estimate was 75% too tall, so the document's total height moved
   as blocks were measured: a reader at the very bottom was clamped up a page by an undo that
   changed nothing near them (measured: 5464 px of estimate against 4728 px of truth, scroll
   4710 → 3974, the mounted window 74 → 97 blocks). The estimate takes the scale now
   (`estimateHeight(block, scale)`, `BlockSizes.setScale`, and a new scale forgets heights
   measured in the old pixels — `markdown_editor.ts: fitPage` tells the renderer and
   `check-block-sizes.mjs` holds the arithmetic). With it, the same undo leaves the scroll and
   the window exactly where they were.

## Handoff

**Waiting on the user's review — nothing is merged.** `codex/a4-page` holds this plan and the
change.

**What changed.** Three files and one probe: the page and desk in `src/styles.css`
(`.markdown-page`, `.markdown-scroller`), the root's class list in
`virtual_block_renderer.ts`, and `setContent`'s scroll reset in `markdown_editor.ts`.
Nothing else in the renderer moved; the footnote preview card has its own root in
`nodes/root.ts` and keeps the old classes, because it is a small card and not paper.

**Acceptance.** `npx tsc --noEmit` clean; `npm run check` **27/27**; a fresh
`npm run tauri dev`; `a4-page` **8 checks**; `npm run probe:all` **92/93 (15 skipped)**, the
one failure being `insert-rule.js`, the caret case already under *Open*. Measured on the
running app: the page is 794 px (210.0 mm) wide and 1123 px (297 mm) tall with 94 px of
padding — 25 mm — leaving a 604 px (159.8 mm) column, centred with 76 px of desk on either
side, the measure 95 characters a line.

**The thing to look at.** The measure: 95 characters is A4's, not a book's. If it reads too
long on screen, the levers are the type size (18 px ≈ 84, 20 px ≈ 75) or a wider margin, and
`a4-page.js` holds the numbers either way.

**What the suite caught.** Three probes went red when the sheet arrived, and all three were
one cause: the view keeps its scroll across a document load, and the taller sheet stopped
the browser clamping it away. `footnote-jump`'s precondition (marker on screen, note below)
depended on landing at the top; `footnote-label-edge` and `undo-run-taken-back` clicked
coordinates read off blocks that had been scrolled out of the window, so the caret fell to
the nearest edge and typing went to the wrong place. The fix is in `setContent`, not in the
probes.
