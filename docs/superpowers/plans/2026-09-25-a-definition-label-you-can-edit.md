# A Definition's Label You Can Edit

**Goal:** the `[^label]` a definition is named by behaves like every other revealable
node: while the caret is inside it, the label is built as its own markdown source, and a
click on a notes run's second (or indented) definition edits *that* note.

**Spec:** this document's part 1; the user's "the definition's label should also be
revealable" (P19's leftover, `docs/roadmap.md`).

## Part 1 — the design

### 1.1 What is wrong today

`nodes/footnote.ts: renderFootnoteLabel` draws the label as a text leaf tagged
`data-text-from="0"` — the *block's* first character, not the definition's. It happens to
be right only when the definition starts its own block. Measured on the running app:

- `Body[^1] here[^2].\n\n[^1]: first\n[^2]: second\n` — both labels carry `textFrom: 0`,
  and a Backspace typed into the *second* label edits the **first** definition;
- `\n\n [^1]: first\n` (one leading space, which markdown allows) — a Backspace in the
  label takes the `[`, one character early.

The label is the one part of a footnote the caret still reaches through a hand-written
tag instead of through the source it is: every other place the author types markdown
characters behind a rendering goes through source mode (`source_mode.ts`).

### 1.2 The shape

The definition's label becomes the same shape a marker already has:

- its own range, from the one home of the marker's shape (`syntax/footnotes.ts:
  markerShape`): the definition's own start, plus `[^label]`;
- `source_mode.ts: isShownSourceRange`, the question `isShownSource` asks, asked of a
  range instead of a node — a definition's node covers the whole note, and only the
  `[^label]` at its head is markdown the caret can show;
- `editing/context.ts: sourceRangeIn` names that range for a caret inside a definition,
  so the source decision is made from the document, as rule 4 requires;
- the label is built as `<span class="markdown-source-view markdown-footnote-source">`
  over the document's own characters while it is shown, and as the notes run's `<a>`
  otherwise, with `data-text-from` naming the *definition's* offset in both shapes.

The click stays exact: this label's rendering holds the author's own characters, so a
click can name one. The caret lands where it was clicked, and the label is revealed
*around* it — the entry a marker cannot have, because its rendering hides its text.

### 1.3 Not this phase

The note's body keeps its rendering (a definition is not shown as raw text), and the
preview card keeps drawing the *rendering* of the label, because it is built outside a
render frame and is not the copy the caret is in.

## Part 2 — tasks

- [x] **Task 1: the label maps through its own definition** (`nodes/footnote.ts`,
      `syntax/footnotes.ts`): `markerShape(label)` is the one home of `[^label]`; the
      label's tag is the definition's offset; the reference's content range reads the
      same shape. Probe: `test/probes/footnote-jump-back.js` edits the second note of a
      run and the indented note.
- [x] **Task 2: the label is revealed while the caret is in it** (`source_mode.ts`,
      `editing/context.ts`, `nodes/footnote.ts`): `isShownSourceRange`, `sourceRangeIn`,
      and the two shapes. Probes: the label is its own source while the caret is in it;
      clicking away renders it again; ⌘-click still jumps.
- [x] **Task 3: acceptance and docs.** `npx tsc --noEmit`; `npm run check` 22/22; a fresh
      `npm run tauri dev` and `npm run probe:all` 79/79 (7 skipped); `docs/architecture.md`
      and `docs/roadmap.md`; then the merge into `main`.

## Handoff, 2026-09-25 — a definition's label you can edit

**What changed.** `syntax/footnotes.ts` gained `markerShape(label)`, the one home of the
`[^label]` a footnote is written as — the marker's length and the label's characters
inside it — and `nodes/footnote.ts` reads the marker's content range and the label's own
shape from it instead of keeping a private copy. The label's `data-text-from` names the
*definition's* offset now, not the block's first character.

The rest of the change makes the label a revealable node of its own: `source_mode.ts:
isShownSourceRange` asks the question `isShownSource` asks, of a range instead of a node
(a definition's node covers the whole note, and the note's text is rendered prose the
author edits where it sits), and `editing/context.ts: sourceRangeIn` names that range for
a caret inside a definition. While the caret is in the label it is built as
`markdown-source-view markdown-footnote-source` over the document's own characters, and
as the notes run's `<a>` otherwise. Its `id` and `data-footnote-def` ride both shapes, so
the jump's target never disappears while the caret is in it.

**Deliberate: the click stays exact.** A marker's rendering hides the characters the
author typed, so entering at the end of its content is the one position that is always
true. This label *is* its own source, character for character, so where the click landed
is a true position too, and the label is revealed around the caret: the caret does not
move when the shape under it changes (`showSourceAt` places it again by offset). The
notes run keeps its own layout classes in both shapes, because the note's text follows
the label on the same line; only the weight changes — from `font-semibold` to the
source's plain text, 14 px and 24.47 px wide before, 22.91 px after, measured on `[^2]`,
which moves the note's own text **1.56 px** left (262.47 → 260.91) while the caret is in
the label. A marker's reveal moves the text after it further than that (its superscript
becomes prose), so this is the same kind of change, at a third of the size.

**The probes.** `test/probes/footnote-jump-back.js`, rewritten: the label at rest and its
missing tooltip; a plain click showing it as its own source with the caret still in the
label and a Backspace taking the character under the click; the second note of a run
revealed at `sourceFrom: 17` — the offset of `[^2]` inside its block, not the block's `0`;
clicking away rendering it again; a Backspace in the second label editing the second
definition; an indented definition tagging its label at 1 and editing the label rather
than the indent; and the ⌘-click jump to a marker which is then shown as its own source.
The second-note and indented checks are the ones that fail without this change; the app
was measured with them before the fix (the second label edited the first definition).

**Acceptance.** `npx tsc --noEmit` clean, `npm run check` **22/22**, a freshly started
`npm run tauri dev`, and `npm run probe:all` **79/79 (7 skipped)**.

**What is left.** Nothing this phase promised. The one visible option not taken: the
revealed label keeps the notes run's 14 px and only loses its weight, because
`.markdown-footnote-source` is not in the monospace list in `src/styles.css` — the
marker's revealed source is plain prose for that same reason. Giving every revealed
footnote source the monospace tone is a one-line change to that list, if the label and
the marker should look alike as well as behave alike; keeping the label's weight in both
shapes is a one-line change the other way, if a pixel-identical notes run matters more
than the cue that the raw marker is what the caret is in.
