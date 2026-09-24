# A Rendered Label, and a Marker That Jumps

**Goal:** a footnote's label reads as the marker it is — the notes run draws `[1]`, and
`[^1]` is what the caret shows while it is inside — the preview card shows the note's
detail alone, and a click on a marker in the text goes to the note instead of putting the
caret in the marker's label.

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
- `click_routing.ts` gives a marker's click to the jump: any click on `[data-footnote-ref]`
  scrolls to its definition and puts the caret at the start of the detail, which is what
  ⌘-click already did. The marker's label is still editable — by arrowing into it, or in
  the notes run — and its source is what the caret shows there.

### 1.3 Not this phase

The definition's label keeps its exact position when the caret is in it (the source view
is the document's own characters), and the definition's body stays rendered prose.

## Part 2 — tasks

- [ ] **Task 1: the definition's label renders the marker** (`nodes/footnote.ts`): `[1]`
      at rest, `[^1]` while the caret is in it, entered as a source by a click.
- [ ] **Task 2: the caret knows what a definition draws** (`caret/offsets.ts`,
      `caret/dom_position.ts`): the drawn label's length and the two mappings through it.
- [ ] **Task 3: the card, and the marker's click** (`footnote_preview.ts`,
      `click_routing.ts`).
- [ ] **Task 4: acceptance and docs.** `npx tsc --noEmit`, `npm run check`, a fresh
      `npm run tauri dev`, `npm run probe:all`; `docs/architecture.md`, `docs/roadmap.md`,
      `docs/adding-a-node.md`; then the merge into `main`.
