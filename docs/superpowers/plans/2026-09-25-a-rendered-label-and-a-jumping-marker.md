# A Rendered Label, and a Jump You Ask For

**Goal:** a footnote's label reads as the marker it is — the notes run draws `[1]`, and
`[^1]` is what the caret shows while it is inside — the preview card shows the note's
detail alone, and a marker in the text stays a thing you click into: a plain click opens
its label as its source, and Ctrl-click (⌘-click) goes to the note.

**Correction, same day.** The first cut read the user's third ask as "a click on a marker
goes to the note, not into the label". The user meant the marker stays revealable — a
click edits the label, as it did since P13 — and the *jump* is what Ctrl-click (⌘-click)
does. `click_routing.ts` keeps the modifier gate it always had; what is new is only that a
click which does not jump is never swallowed, so a marker whose note the document does not
define keeps the editor's own click.

**Spec:** the user's three asks after the definition-label phase; `docs/roadmap.md`.

## Part 1 — the design

### 1.1 Why the label drew its own source

The label's rendering *was* the author's characters (`[^1]`), so there was nothing for
the reveal to reveal. Drawing the marker instead (`[1]`, exactly what the reference in
the text draws) makes the reveal real — and it takes the label's caret mapping with it,
because `[1]` no longer spells the document's characters:

- the label's `data-text-from` tag has to go (the tag promises "this element's text *is*
  the document's characters from here", and `editing/typed_text.ts` writes into it);
- without it the caret falls through to the rendered model, and measured on the app a
  character typed with the caret drawn inside `[1]` lands **three characters into the
  note** (`The first note.` → `ThXe first note.`), because the label's three rendered
  characters are counted as the note's own.

So the caret model has to know what a definition draws: a marker's worth of characters
(`[label]`, one character shorter than the `[^label]` it stands for) and then the note.

### 1.2 The shape

- `syntax/footnotes.ts: markerShape` already says how long a marker is, and the reference
  in the text already renders `[label]`; a definition's label renders the same shape, and
  the definition's drawn length is that plus its children (`caret/offsets.ts`), with the
  two directions of the mapping carrying a raw offset inside the marker to the label's own
  drawn characters and back (`offsets.ts: mapNode`, `dom_position.ts: mapNodeRawToRendered`).
- The label becomes a component in its own right (`nodes/footnote.ts: FootnoteLabel`), a
  `RevealableNodeComponent` with the definition as its node: a click enters its source at
  the content end (the label cannot name a character any more), ⌘-click still jumps to the
  marker, and both shapes keep `id="fn-label"` and `data-footnote-def`.
- The card draws the note's detail alone: hovering a marker is for reading the note.
- `click_routing.ts` keeps the two gestures apart: a plain click belongs to the marker
  (it opens the label as its source, in place), Ctrl-click and ⌘-click scroll to the
  definition and put the caret at the start of the detail. The click is swallowed only
  when the jump happens.

### 1.3 Not this phase

The definition's label keeps its exact position when the caret is in it (the source view
is the document's own characters), and the definition's body stays rendered prose.

## Part 2 — tasks

- [x] **Task 1: the definition's label renders the marker** (`nodes/footnote.ts`): `[1]`
      at rest, `[^1]` while the caret is in it, entered as a source by a click.
- [x] **Task 2: the caret knows what a definition draws** (`caret/offsets.ts`,
      `caret/dom_position.ts`): the drawn label's length and the two mappings through it.
- [x] **Task 3: the card, and the two gestures** (`footnote_preview.ts`,
      `click_routing.ts`): the card draws the note alone; a click on a marker reveals its
      label, Ctrl-click and ⌘-click jump to the note.
- [x] **Task 4: acceptance and docs.** `npx tsc --noEmit`, `npm run check`, a fresh
      `npm run tauri dev`, `npm run probe:all`; `docs/architecture.md`, `docs/roadmap.md`,
      `docs/adding-a-node.md`; then the merge into `main`.

## Handoff, 2026-09-25 — a rendered label and a jumping marker

**What changed.** The definition's label is drawn as the marker it is — `[1]`, the shape
the reference in the text draws — and is shown as its own source (`[^1]`) while the caret
is inside it. It is a component of its own now (`nodes/footnote.ts: FootnoteLabel`, a
`RevealableNodeComponent` whose node is the definition, since the label is not a node of
the parse): a click enters its source at the end of its content, ⌘-click jumps to the
marker, and `id`/`footnoteDef` ride both shapes so the jump's target never disappears.
`renderFootnoteLabel` is gone — the card no longer draws a label, so the notes run is the
one place the label is drawn.

**The caret had to learn the drawing.** `[1]` no longer spells the document's characters,
so the label cannot carry the `data-text-from` tag that promises it does. The drawn shape
is a marker's worth of characters, then the note: `caret/offsets.ts: drawnMarkerLength`
(shared with the marker's own rendered length) plus a `footnoteDefinition` case in
`renderedLength`, `mapNode` and `caret/dom_position.ts: mapNodeRawToRendered`. Without it,
measured on the app: the caret walked into the drawn label and a character typed there
landed **three characters into the note** (`The first note.` → `ThXe first note.`). With
it, the caret lands on the marker's own characters, which is what shows the source.

**The card** shows the note's words alone — no label in front of them — because the marker
the pointer rests on already says which note it is; its class dropped the flex/gap the two
children needed.

**The gestures.** A click on a marker is the marker's own: it opens its label as its
source, in place, and the page keeps its place (`scrollTop` 0 in `footnote-jump.js`, on a
document whose note starts off screen). Ctrl-click and ⌘-click go to the note — scrolled
into view, the caret at the start of its text, in the note and never in the label. Neither
follows the `#fn-label` href. The click is swallowed only when the jump happens, so a
marker whose note the document does not define keeps the editor's own click.

**The probes.** `footnote-jump.js` (rewritten, with checks): a plain click shows the
marker as its own source and does not move the page; a Ctrl-click and a ⌘-click each
scroll a note that started off screen into view (`scrollTop` 619 px on the probe's
document), land the caret in the note's own text node at offset 0, and leave the label
drawn `[1]`; neither follows the href. `footnote-source.js` (rewritten): a marker draws
`[1]`, a click opens it as `[^1]` without following the href, and `[^1]` typed over into
`[^2]` edits the label and re-renders both ends. `footnote-jump-back.js`
(rewritten): the label draws `[1]` with no tag; a click shows `[^1]` and typing goes at
the end of its content; a caret that leaves draws the marker again; the caret walking in
from the note edits the label rather than the note; the second note of a run shows
`sourceFrom: 17` and edits its own definition; an indented definition starts at 1; and the
⌘-click jump lands on a marker that is then its own source. `footnote-preview.js`: the
card is the note's words with no label, and a marker being edited shows no card.

**Acceptance.** `npx tsc --noEmit` clean, `npm run check` **22/22**, a freshly started
`npm run tauri dev`, and `npm run probe:all` **79/79 (7 skipped)**.

**What is left.** Nothing this phase promised. One thing worth a later look, measured
here: the rendered label shows the *identifier* (`[ab]` for `[^Ab]`), which is what the
marker in the text already did, so a label whose case matters reads differently from its
source until the caret is in it.
