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
- [ ] Task 2: `test/probes/reveal-click-scroll.js` — the rule just below the fold, then a
      click on the lowest visible citation and on the lowest visible wikilink: the scroll
      must not move. It must fail before the fix.
- [ ] Task 3: the fix in `enterSource`, with the rule's reasoning in the comment.
- [ ] Task 4: acceptance and docs — `npx tsc --noEmit`, `npm run check`, a fresh
      `npm run tauri dev`, `npm run probe:all`; `docs/architecture.md` (the click/scroll
      rule), `test/README.md`, `docs/roadmap.md`; then the merge into `main`.

## Handoff

To be written when the phase closes.
