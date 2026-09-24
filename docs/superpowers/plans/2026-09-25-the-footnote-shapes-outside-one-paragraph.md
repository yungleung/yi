# The Footnote Shapes Outside One Paragraph

**Goal:** widen the footnote probes beyond the one-paragraph documents the last phases
were written on — a definition inside a description detail, a list item, a blockquote and a
table cell; two markers naming one label; a non-numeric label; an undone label edit; a
label left mid-edit when its block is rebuilt; and the caret at the `]: ` boundary just
after a drawn label — and fix what the measurements find.

**Spec:** the user's list after *a rendered label and a jumping marker*
(`docs/roadmap.md`, *Open*). Everything below was measured on the running app first, one
scratch probe at a time under `/private/tmp`, in the order the list takes them.

## Part 1 — what the app does today

### 1.1 A definition inside a container

All three real container shapes drawn and worked, on the app, before any change: the label
is drawn as the marker (`[1]`), a plain click shows its own source (`[^1]`, `sourceFrom`
`2` in a description detail, `24` in a list item, `26` in a blockquote — the definition's
own offset, not the block's), typing in it edits the label (`[^19]`), the caret walking in
from the note lands at the label's content end and types there (`[^91]`), and a ⌘-click on
the marker in the text lands the caret at the start of the note's own text node.

A table cell is the one shape markdown has no definition for: `| [^1]: note |` renders
those characters as text (measured: the cell reads `[^1]: noted`, no marker, no
definition), while a marker *inside* a cell with the definition below the table renders as
a marker and jumps. Both are pinned as such.

### 1.2 Two bugs in the blockquote

The label scan and the jump both read a definition line as `^ {0,3}\[\^label\]:`. A
definition written inside a blockquote sits behind its `>`:

- `Body[^1] here.` with the note written `> [^1]: the note in the quote` leaves the body's
  `[^1]` **literal text** — the document's labels never see the definition, so the
  cross-block borrow (`withFootnoteDefinitions`) never happens. A definition inside a list
  item (indent 2) or a description detail works today; a `10. ` item, whose content indent
  is four columns, does not.
- A ⌘-click on a marker *inside* a blockquote finds no definition body either, so
  `jumpToFootnote` returns false and the click falls back to the marker's own reveal: the
  caret lands at offset 3 **in the marker's source** (`[^1]`, between the label and its
  `]`) instead of at the start of the note.

### 1.3 A click just right of a drawn label writes into the label

The mapping's `<=` edge, measured on the button's own output (`[^1]: ` — an empty note): a
click one pixel right of the drawn `[1]`, or on its right edge, puts the caret at the
label's own characters, so typing `H` gives **`[^1H]: `**. A click on the note's first
character (a tagged text node) is exact and writes `[^1]: H`, so the same visual position
has two different meanings — the one the drawn label is one character shorter than its
source buys.

### 1.4 Renaming a label leaves the markers stale

`First[^a] and[^a] again.` with the note `[^a]: one note.`: clicking the label in the notes
run and typing `b` writes `[^ab]: one note.`, and the two markers in the paragraph — a
block of their own, whose text did not change — **keep drawing `[a]`** (checked 700 ms
after the burst, and again after clicking that block: still markers). Markdown reads a
reference only when a definition is in the parse, so both should be plain text now. The
cause is the parse cache: `state.getBlockContent` keys a block's parse by its own text,
but a block holding a marker is parsed with the document's definitions *borrowed*, so the
labels are a second input to that parse and to the rendering built from it.

## Part 2 — the fixes

1. **The definition line reads past its containers** (`syntax/footnotes.ts`): one home for
   the prefix a definition may sit behind — quote markers, list markers and the up-to-three
   spaces markdown allows at each level — used by `DEFINITION`, `DEFINITION_START`,
   `DEFINITION_LINE` and the `footnoteOffsets` definition regex. A four-space indent at the
   top of a document is still an indented code block, not a definition.
2. **The drawn label's right boundary belongs to the note** (`caret/offsets.ts`): a caret
   at exactly the drawn label's end maps through the definition's children — the note's
   first position — instead of into the marker's own characters.
3. **A block that borrows the document's definitions keys on them**
   (`document/state.ts`, `virtual_block_renderer.ts`): the state keeps a label version,
   bumped only when the label *set* changes, and a block holding a marker (`[^x]`, which
   the borrow can turn into a reference) keys its parse and its rendering on it. A block
   with no marker in it keeps the key it had, so a rename does not throw away parses and
   remembered heights the change cannot reach.

## Part 3 — tasks

- [x] Task 1: measure the uncovered shapes on the app (scratch probes; §1).
- [x] Task 2: fix the definition-line rule, with the pure check in
      `test/checks/check-footnotes.mjs`.
- [x] Task 3: fix the drawn label's right boundary.
- [x] Task 4: fix the label-dependent parse and render key, with a check.
- [x] Task 5: the probes — `footnote-containers.js`, `footnote-container-jump.js`,
      `footnote-table-cell.js`, `footnote-repeat-label.js`, `footnote-labelled.js`,
      `footnote-label-undo.js`, `footnote-label-rebuild.js`, `footnote-label-edge.js` —
      and checks for `footnote-block.js`, which only reported.
- [x] Task 6: acceptance and docs — `npx tsc --noEmit`, `npm run check`, a fresh
      `npm run tauri dev`, `npm run probe:all`; `docs/roadmap.md`, `docs/architecture.md`,
      `test/README.md`; then the merge into `main`.

## Handoff

**What the phase was for.** The probes that held the last four phases were written on
one-paragraph documents and the straightforward shapes. Each case below was measured on
the app *first*, from a scratch probe under `/private/tmp`, and then written as a probe
that fails without what it holds.

**What the measurements found, and what it cost to fix.** Three bugs, none of them
visible to the compiler or to the suite as it stood:

1. A definition written inside a **container** — `> [^1]: note` in a blockquote, and a
   definition four columns into a `10. ` item — was invisible to the document's label
   scan, and to the jump's own line rule. Measured: `Body[^1] here.` stayed the literal
   text `[^1]` when the note was written in a quote, and a ⌘-click on a marker inside a
   quote landed the caret *in the marker* (`[^1]`, offset 3) instead of at the start of
   the note. Fixed by one home for the prefix a definition may sit behind
   (`syntax/footnotes.ts: CONTAINERS`): quote markers, list markers and the up-to-three
   spaces markdown allows at each level, repeated, which covers `> [^1]:`,
   `> - [^1]:` and `- [^1]:`. Four spaces at the top of a document are still an indented
   code block, and the wide-item case is a residue the roadmap records.
2. The position just after a **drawn label** belonged to the label. Measured on the
   button's own output: a click in the gap right of `[1]` then typing `H` gave
   `[^1H]: ` — the note lost the character — while a click on the note's first character
   gave `[^1]: H`. Fixed by letting the drawn label own only what is strictly inside it
   (`caret/offsets.ts: mapNode`), so the boundary falls through to the note's own first
   position.
3. A block that had **borrowed** the document's definitions kept its stale parse. Measured:
   renaming the label of `First[^a] and[^a] again.` in the notes run left both markers
   drawing `[a]` (checked 700 ms later, and again after clicking their block). Fixed by
   keying a block that holds a marker on the labels it borrowed (`document/state.ts:
   parseKey`, used by the renderer's own `renderKey`), with the version moving only when
   the label *set* changes — typing in a note must not re-parse the document.

**The probes.** `footnote-containers.js` (a definition inside a description detail, a list
item and a blockquote: the drawn label, the click's source at the definition's own
block-relative offset, and typing in it), `footnote-container-jump.js` (the ⌘-click to the
note and back, per container), `footnote-table-cell.js` (a marker in a cell, and a
definition written in one, which markdown has no reading for), `footnote-repeat-label.js`
(two markers, one label: both jump, renaming in the notes run turns both into text, one
undo brings them back), `footnote-labelled.js` (`[^note]` and `[^Ab]`: both ends draw the
identifier, both sources spell the author's characters), `footnote-label-undo.js` (an
undone label edit, with the caret back in the label), `footnote-label-rebuild.js` (a label
mid-edit across the rebuild its own keystroke causes, and a label deleted out from under
the caret), `footnote-label-edge.js` (the `]: ` boundary, on a written note and on the
button's fresh one), and `footnote-block.js`, which only reported and now checks.
`test/checks/check-footnotes.mjs` gained the container cases and `check-parse-keys.mjs` is
new, for the parse key itself.

**Acceptance.** `npx tsc --noEmit` clean, `npm run check` **23/23**, a freshly started
`npm run tauri dev`, and `npm run probe:all` **87/87 (7 skipped)** — ninety-four probes,
of which seven need the fixture workspace or a foreground window and are run by name.

**What is left.** One visible decision, and it is the user's: a drawn footnote label shows
the *identifier*, so `[^Ab]` reads `[ab]` at rest while the source spells `[^Ab]`
(`docs/roadmap.md`, *Measure before deciding*). And one measured residue: a definition
indented inside an item wider than three columns is read as the code block it looks like
(*Accepted, for now*).
