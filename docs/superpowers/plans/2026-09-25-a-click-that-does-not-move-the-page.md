# A Click That Does Not Move the Page

**Goal:** a click that opens a citation, a wikilink or any other node as its own
source must leave the page where the reader was. Today, when the node is near the
bottom of the visible area, the view moves under it.

**Spec:** the user's report — *"sometimes a click on citation and wikilink will cause a
jump of the page"* — and their reproduction: in the demo document, with the thematic
break right below the visible area, clicking the citation (or a wikilink) above it
moves the view.

## Part 1 — what was measured

Reproduced on the app (`--with-workspace --fixture default-document.md`), with the
rule's block placed 4px below the scroller's bottom edge, then a real
`mousedown`/`mouseup`/`click` on the lowest visible citation:

| | |
| --- | --- |
| scroll before | `1313` |
| scroll after | `1290` |
| the scroll event's time | **98 ms after the click** |
| the rule's on-screen top | `787` → `810` |
| the clicked block's height | `107` → `107` (unchanged) |
| the caret after the click | `y 612`, well inside the viewport `[30, 783]` |

So the view moved a line even though the layout did not change and the caret was on
screen: something scrolls the container after the block is rebuilt, and nothing puts it
back. An **edit** has exactly this rule already — `editing/context.ts: keepScroll`, "the
reader ends up half a page away even though the document only gained a line", restored
when the caret is still visible at the old position. A **click that opens a source**
reaches the same rebuild (`source_mode.ts: enterSourceOf` →
`markdown_editor.ts: enterSource`) and never asks.

The earlier attempts are worth recording because they were *not* the bug: a click on a
visible citation/wikilink does not navigate (`preventDefault`, `location.hash`
unchanged), it lands the caret inside that node's own source at its content end, and
with the scroll settled and the node anywhere but the very bottom edge of the view it
moved nothing (top level, description detail, list item, blockquote, table cell, a
240-paragraph virtualized note, a node 30px above the fold).

## Part 2 — the fix

One seam: every click that opens a source goes through
`markdown_editor.ts: enterSource` (the handler `source_mode.ts` calls, for
`nodes/link.ts`'s capture click and for every `RevealableNodeComponent`). It captures
the scroll position, places the caret, and then calls the same `keepScroll` the edits
call — so the reader stays where they were when the caret is still visible there, and
an entry that genuinely lands out of view still scrolls it in.

The footnote jump is untouched: it *asks* to move (`renderer.revealOffset`), and it does
not go through `enterSource`.

## Part 3 — tasks

- [x] Task 1: reproduce it, and rule out the neighbours (Part 1).
- [x] Task 2: `test/probes/reveal-click-scroll.js` — the rule just below the fold, then a
      click on the lowest visible citation and on the lowest visible wikilink: the scroll
      must not move. It must fail before the fix.
- [x] Task 3: the fix in `enterSource`, with the rule's reasoning in the comment.
- [x] Task 4: acceptance and docs — `npx tsc --noEmit`, `npm run check`, a fresh
      `npm run tauri dev`, `npm run probe:all`; `docs/architecture.md` (the click/scroll
      rule), `test/README.md`, `docs/roadmap.md`; then the merge into `main`.

## Handoff

**The bug, and how it was found.** Sixteen scratch probes under `/private/tmp` before the
reproduction, and most of them said "no movement": a click on a visible citation or
wikilink does not navigate, lands the caret in that node's own source at its content end,
and moves nothing at the top level, in a description detail, in a list item, in a
blockquote, in a table cell, mid-viewport, 30px above the bottom edge, or in a
240-paragraph note whose virtual window really is mounting and unmounting blocks. The
user's own recipe — the demo document's thematic break just below the fold — was what
reproduced it, and two details mattered: the click has to be on the **lowest** visible
citation, and the arrangement has to be reached by scrolling **down** (arriving at the
same fold by scrolling up from the end of the document does not move anything). Then it
is exact and repeatable: `1313 → 1290`, a scroll event 98ms after the click, the layout
unchanged, the caret on screen at `y 612` of `[30, 783]`.

**The fix.** Every click that opens a source passes through one seam —
`source_mode.ts: setSourceEntryHandler` is wired to `markdown_editor.ts: enterSource`
(`nodes/link.ts`'s own capture-phase click and every `RevealableNodeComponent`'s
`placeCaretAt` both reach it). That seam now takes the scroll position before placing the
caret and calls the same `keepScroll` an edit calls, so the reader stays where they were
when the caret is still visible there and an entry that genuinely lands out of view still
scrolls it in. The footnote jump does not go through this path
(`renderer.revealOffset`), so an asked-for move still moves.

**The probe.** `test/probes/reveal-click-scroll.js` (`@needs-workspace`: the citations and
wikilinks need the fixture bibliography and notes) scrolls down to put the rule 4px below
the fold, checks that a citation and a wikilink really are on the last visible line with
the rule below, then clicks each with a real `mousedown`/`mouseup`/`click` and requires
the scroll to be unchanged — and that the clicked node still opened as its own source, so
it cannot pass by doing nothing. Before the fix it fails on the citation by **24px**
(measured three times, 23–24px); after it, `delta 0` for both.

**Acceptance.** `npx tsc --noEmit` clean, `npm run check` **23/23**, a freshly started
`npm run tauri dev`, `npm run probe:all` **87/87 (8 skipped)** — the new probe is one of
the skipped-by-name ones — plus `reveal-click-scroll`, `fixture-workspace`,
`fixture-math-note` and `fixture-large-document` run by name against that fresh app, and
the source-entry probes by hand (`revealable-flows`, `revealed-source-exit`,
`inline-math-source`, `math-source-caret`, `display-math-source`, `boundary-caret`,
`footnote-jump`, `footnote-jump-back`, `footnote-source`, `footnote-preview`,
`description-list`).

**What is left.** Nothing this phase promised. Not measured, and worth a look if anyone
reports it: the *pointer* click (plain text near the fold) and the *gutter* click
(`routePointerClick`) do not take the same treatment — they place the caret where the
reader pointed, which the browser has already scrolled to, so neither was measured to
move the view.
