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

- [ ] **Task 1: the label maps through its own definition** (`nodes/footnote.ts`,
      `syntax/footnotes.ts`): `markerShape(label)` is the one home of `[^label]`; the
      label's tag is the definition's offset; the reference's content range reads the
      same shape. Probe: `test/probes/footnote-jump-back.js` edits the second note of a
      run and the indented note.
- [ ] **Task 2: the label is revealed while the caret is in it** (`source_mode.ts`,
      `editing/context.ts`, `nodes/footnote.ts`): `isShownSourceRange`, `sourceRangeIn`,
      and the two shapes. Probes: the label is its own source while the caret is in it;
      clicking away renders it again; ⌘-click still jumps.
- [ ] **Task 3: acceptance and docs.** `npx tsc --noEmit`; `npm run check` 22/22; a fresh
      `npm run tauri dev` and `npm run probe:all` 79/79 (7 skipped); `docs/architecture.md`
      and `docs/roadmap.md`; then the merge into `main`.
