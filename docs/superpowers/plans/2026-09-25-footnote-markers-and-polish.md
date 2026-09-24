# Footnote Markers, and Two Pieces of Polish

**Goal:** the four things asked for after the code-block decision: the definition's marker is
missing from the preview card (a bug), a click on a marker jumps the page, and the markers
carry tooltips and a card whose corners are rounder than the find bar's.

**Architecture:** all four are small and all four have one home. The jump is a *fragment
navigation* — the marker renders `<a href="#fn-1">` and nothing prevents the default — and the
fact that a rendering never navigates belongs to `EditableNodeComponent`, where the click a
node owns is handled (a link already prevents it privately, which is why only the footnote
marker navigated). The marker in the card is the label the notes run already draws, so the
label becomes one function with two callers.

**Spec:** this document; the measurements below were taken before any change.

## What was measured first

- **The preview card holds no marker**: its text is `The definition, with a note.` — the
  `[^1]` the notes run draws is absent.
- **A click on the marker's own anchor navigates**: `defaultPrevented: false`, `location.hash`
  goes `"" → "#fn-1"`, and the page scrolls (in a long note, `scrollTop 0 → 11`). The click on
  the `<sup>` around it does not — which is why every probe missed it and a person did not.
- A click on the *definition's* label (the `[^1]` in the notes run) is clean: caret placed, no
  scroll, no source shown.
- Both markers carry `title` attributes; the card's corners are 16 px (`card` →
  `rounded-box`) against the find bar's `rounded-md`.

## The changes

1. **The click a node owns never navigates.** `nodes/editable_node.ts`'s click handler calls
   `preventDefault()`. That is the one home for it; `nodes/link.ts` preventing it privately is
   what made the footnote marker, which was written the same way as the others, the only node
   that navigated.
2. **One label, two callers.** `nodes/footnote.ts` gains `renderFootnoteLabel(node)`, used by
   the definition and by the preview card, which now draws the marker before the note it
   names.
3. **No tooltips.** The `title` on the marker and on the definition's label go: the gestures
   are the same as every other revealable node's, and those carry none.
4. **The card's corners match the find bar's**: `rounded-md`, by dropping daisyUI's `card`
   class and using the toolbar's own classes.

## Evidence

```bash
npx tsc --noEmit
npm run check                                   # 22/22 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe -- --fixture default-document.md test/probes/footnote-source.js
npm run probe -- --fixture default-document.md test/probes/footnote-preview.js
npm run probe -- --fixture default-document.md test/probes/footnote-jump-back.js
npm run probe:all                               # 79/79 probes, 7 skipped
```
