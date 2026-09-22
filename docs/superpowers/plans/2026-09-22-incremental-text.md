# Incremental text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an edit should cost what the edit is worth, not what the document is
worth. Today `replaceRange` builds a whole new string (`slice` + `slice` + concat)
and `splitBlocks` walks every line of it, so one keystroke in a 320 KB note
allocates ~640 KB and re-splits several thousand lines. Rendering is already
incremental (P4), the history is already a delta log (P5); the text is the last
thing that is not.

**Architecture:** the text becomes a **piece table** — the original text plus an
append-only buffer of everything inserted, held as a balanced tree of pieces with
their lengths — so an edit splits two pieces, drops the covered range and inserts
one new piece, and any range is read by walking to it in O(log n). `splitBlocks`
gains the matching half: after an edit it re-splits from the block that holds the
first changed line and stops as soon as it re-synchronises with the blocks it had,
which is what keeps a fence or a table from being re-scanned by an edit that did
not touch it.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** this document's part 1. Like the incremental-history plan there is no
separate spec: the design document
(`docs/superpowers/specs/2026-09-21-markdown-editor-architecture-design.md`) states
the invariant this phase serves — the document text is the only source of truth —
and stops there.

## Global Constraints

- **Behaviour is preserved.** The same edits produce the same text, the same blocks
  (same kinds, same line and character ranges, in the same order), the same caret
  and the same rendered window. `getText()`, `getBlocks()`, `getBlockAtOffset`,
  `getBlockAtLine`, `getBlockContent`, `historyEdits()`, `undo`, `redo` and
  `loadText` keep their signatures and their meaning.
- **The offsets do not move.** Everything downstream — the caret, the source mode,
  the tables, the history — is written in document offsets, and this phase must not
  change what any of them means at a given moment.
- `npx tsc --noEmit` and `npm run check` stay green, and the check count grows;
  `npm run probe:all` keeps its count (61/61 passing, 6 skipped) from a freshly
  started app.
- Commit style: `refactor(document): …`, `test: …`, `docs: …`.

---

## Part 1 — the design

### 1.1 The two costs

| Cost | Where | Today | With this phase |
| --- | --- | --- | --- |
| the text | `state.replaceRange` | `slice` + `slice` + concat: O(document) bytes per edit | O(pieces touched), O(1) amortised for the appended text |
| the blocks | `state.updateText` → `splitBlocks` | every line, every edit | from the changed block until the new split re-synchronises |

Everything else is already incremental: the parse cache is keyed by block content
(P0), the renderer rebuilds only blocks whose content key changed (P4), and the
history records a delta (P5).

### 1.2 The piece table

```ts
class TextStore {
  readonly length: number;
  /** The text in [from, to). */
  slice(from: number, to: number): string;
  /** Replaces [from, to) with `replacement`. */
  replace(from: number, to: number, replacement: string): void;
  /** The whole text. Callers that had a string still get one. */
  toString(): string;
  /** How many pieces the tree holds — what "incremental" looks like from outside. */
  pieceCount(): number;
}
```

Two buffers — `original`, never written, and `added`, append-only — and a tree of
pieces naming a buffer, an offset and a length. `replace` walks to the two cut
points, drops the pieces between them and inserts one piece for `replacement`,
appended to `added`, so nothing is copied twice. The walk is O(log n) because each
node carries its subtree's length; a document that has only ever been appended to
is a single piece.

Why a tree and not an array of pieces: an array makes the walk O(pieces), which
after an hour of typing is O(document) again. The tree's per-node length is what
makes "the offset 900,000" reachable without counting every piece before it.

The balancing is the price of either structure: a rope needs the same rotations
and the same per-node lengths, and this choice buys no less machinery — it buys
less copying. Existing text is never rewritten, only re-viewed, and in exchange the
text it replaced stays reachable until `compact()` runs (Task 1). That is the trade
in one line: a rope pays in rebalancing, a piece table pays in retention.

### 1.3 The re-synchronising split

`splitBlocks` is a line walk whose result depends on more than one line: a fence
closes where the matching fence is, a list runs while its items do, a table's shape
comes from the delimiter line. So the rule cannot be "re-split the changed lines";
it is:

> Re-split from the start of the block that holds the first changed line, keep
> producing blocks, and stop at the first point where the new block ends exactly
> where an old block ended and the text after that point is unchanged.

The blocks that survive keep their identity — and therefore their content key,
their measured height and their DOM element. The ones the edit reached are
rebuilt, and the line numbers and character offsets below shift by the edit's
delta, which the store knows without measuring.

**Non-goal, stated out loud:** block `charStart`/`charEnd` are absolute offsets, so
shifting every block below an edit is O(blocks) per edit even with a piece table. A
later phase can make them lazy — a line index that answers "where is line N" in
O(log lines), so nothing shifts — and that is the natural follow-on; it changes
what `MarkdownBlock` means, and it is not needed for the text and the split to stop
copying the document.

**Also not this phase, and deliberately: a prettify / format-on-save pass.** Wrapping
a long paragraph into several source lines was considered and dropped. The file
saved on disk is the editor's text (that is invariant 1), so nothing needs the file
to be *tidied* — only to be the text — and a whole-text rewrite would have cost the
things this design spent two phases getting: a whole-document history entry per
save, a rebuild of every block's content key, and a caret that has to be mapped
rather than kept. If source readability ever becomes a real requirement it is a
phase of its own, with the store's per-paragraph `replace` as its tool.

---

## Part 2 — what the tree has today

| Thing | Where | Note |
| --- | --- | --- |
| The text | `document/state.ts: private text: string` | replaced wholesale by `replaceRange`, `setText`, `loadText` |
| The split | `document/blocks.ts: splitBlocks` | a line walk over the whole document, called from `state.updateText` |
| Who reads the text | `getText()` (many callers), `getBlockContent(block)` (per-block slices) | the per-block slice is the one that matters for cost |
| The checks that grow | `test/checks/check-blocks.mjs`, `check-history.mjs` | both bundle the document modules with DOM stubs |

---

## Part 3 — tasks

### Task 1: The `TextStore`, proven against a string

**Files:**
- Create: `src/ui/markdown/document/text_store.ts`, `test/checks/check-text-store.mjs`

**Interfaces:**

- Produces: `class TextStore` — `constructor(text?: string)`, `length`,
  `slice(from, to)`, `replace(from, to, replacement)`, `toString()`, `pieceCount()`,
  `compact()`.
- Consumes: nothing.

- [ ] **Step 1: Write the check (RED)**

The check is a property test against a plain string, because that is the only
statement that can be made exhaustively: any sequence of edits must leave the store
holding exactly what the string holds.

```js
const edits = [[0, 0, 'hello'], [5, 5, '\n\nworld'], [2, 4, 'X'], [0, 1, ''], [store.length, store.length, '\nend']];
let reference = '';
for (const [from, to, text] of edits) {
  store.replace(from, to, text);
  reference = reference.slice(0, from) + text + reference.slice(to);
  check(`after edit ${JSON.stringify([from, to, text])}`, store.toString(), reference);
}
check('a range read agrees with the string', store.slice(1, 9), reference.slice(1, 9));
check('an edit past either end is clamped like the string', (store.replace(999, 999, '!'), store.toString()), `${reference}!`);
check('typing appends rather than fragmenting', store.pieceCount(), 2);
check('a whole-document replacement can be compacted away', (store.replace(0, store.length, 'fresh'), store.compact(), store.pieceCount()), 1);
```

- [ ] **Step 2: Write the store** — the house header; no DOM, no editor, no state.
- [ ] **Step 3: Compaction** — `compact()` rebuilds the table with the current text
  as its `original` and an empty `added`, so the dead half of a session's edits can
  be dropped; `loadText` calls it, and a byte budget can. It is not optional
  tidiness: two callers *already* rewrite the whole
  document through `setText` (`editing/formatting.ts`, `editing/find_controller.ts`),
  and each leaves the text it replaced sitting in `original` — which is what the
  check asserts: after a whole-document `setText` and a `compact()`, the piece count
  and the reachable buffers are back to one.
- [ ] **Step 4: Verify** — `npx tsc --noEmit`, `npm run check` (17/17).
- [ ] **Step 5: Commit** — `refactor(document): hold the text as a piece table`

### Task 2: `state.ts` on the store

**Files:**
- Modify: `src/ui/markdown/document/state.ts`, `test/checks/check-history.mjs`

**Interfaces:**

- Consumes: `TextStore` from Task 1.
- Produces: today's surface. `getText()` keeps returning a string; the store is
  what the state holds.

- [ ] **Step 1: Swap the field** — `private readonly text = new TextStore(...)`;
  `getText()` returns a string (cached per version, so the many readers of a long
  document are not each materialising it), `replaceRange` applies the clamped edit
  to the store, `setText`/`loadText` replace it, `getBlockContent` keeps slicing
  per block.
- [ ] **Step 2: Prove the equivalence** — the state cases in `check-history.mjs` and
  `check-blocks.mjs` must pass *without being edited*; add one case that a hundred
  deterministic pseudo-random edits leave `getText()` equal to a string edited
  alongside.
- [ ] **Step 3: Verify** — `npx tsc --noEmit`, `npm run check` (17/17), and in the
  app: `regression-undo`, `edit-stability`, `undo-after-scroll`, `paste-blocks`.
- [ ] **Step 4: Commit** — `refactor(document): keep the text in a store, not a string`

### Task 3: The re-synchronising split

**Files:**
- Modify: `src/ui/markdown/document/blocks.ts`, `document/state.ts`,
  `test/checks/check-blocks.mjs`

**Interfaces:**

- Produces: `splitBlocksFrom(text, previous, firstChangedLine): MarkdownBlock[]` —
  re-split from the block holding the changed line, stopping where the new split
  re-synchronises with `previous`.
- Consumes: the previous blocks and the text.

- [ ] **Step 1: The check (RED)** — after any edit, the blocks from the incremental
  path must equal `splitBlocks(text)` exactly: same kinds, same line and character
  ranges, same order. Drive it with Task 1's edit sequence plus the cases that make
  resynchronisation hard: an edit inside a fence, one that opens a fence, one that
  closes it, one that joins two blocks, one that splits one, one that changes a
  table's shape.
- [ ] **Step 2: The implementation** — the walk above; a block is "the same" when
  its line range and kind are unchanged, and the loop stops there.
- [ ] **Step 3: Verify** — `npx tsc --noEmit`, `npm run check` (17/17), and the
  probes that watch blocks and scrolling: `block-gaps`, `spacing`,
  `empty-paragraphs`, `edit-stability`, and `scroll-cost` with the large note.
- [ ] **Step 4: Commit** — `refactor(document): re-split from the change, not the document`

### Task 4: The footnote-label scan — the third cost, and the one no store fixes

**Files:**
- Modify: `src/ui/markdown/syntax/footnotes.ts` (the rule),
  `document/state.ts` (the cache), `test/checks/check-footnotes.mjs`

**Interfaces:**

- Produces: `labelsAfterEdit(labels, text, edit): ReadonlySet<string>` — the labels
  a document defines after one range replacement, given the labels before it and the
  edit (`DocumentEdit`, the shape the history already records).
- Consumes: `footnoteLabels(text)` from the same module, as the full-scan fallback.

- [ ] **Step 1: The check (RED)** — a property test: for a deterministic sequence of
  edits that creates a definition, renames a label, deletes a definition line and
  joins two lines into one, `labelsAfterEdit` must equal `footnoteLabels(text)` on the
  result. The cheap rule may be conservative — falling back is always correct — it may
  not be wrong.
- [ ] **Step 2: The implementation** — `state.ts: updateText` stops nulling the label
  cache; `replaceRange` folds the edit into the set (`labelsAfterEdit`), and
  `setText`/`loadText` recompute it. The rule rescan only when the edit's own
  removed/inserted text or the line it lands on can hold a definition
  (`/^\[\^[^\]]+\]:/m`).
- [ ] **Step 3: Verify** — `npx tsc --noEmit`, `npm run check` (17/17), and the
  timing in Task 5's probe, which gains a document with a thousand footnotes: that is
  where the scan shows, because `getBlockContent` asks for the labels on every
  non-raw block parse.
- [ ] **Step 4: Commit** — `refactor(document): keep the footnote labels across an edit`

### Task 5: What it cost, measured

**Files:**
- Create: `test/probes/edit-cost.js`

**Interfaces:** none. This is the phase's evidence, beside its checks.

- [ ] **Step 1: The probe** — type fifty characters at the end of the 323 KB fixture
  note (`@needs-large-document`), reporting per-keystroke settle time, how many
  blocks were rebuilt and how many elements survived. Running the same probe against
  the demo document gives the other end of the comparison, so "an edit does not cost
  what the document costs" is measured rather than asserted. A third run adds a
  thousand footnote definitions, which is what makes Task 4's scan visible.
- [ ] **Step 2: Verify** — the probe by name with the large note, then `npm run probe:all`.
- [ ] **Step 3: Commit** — `test(document): measure what a keystroke costs`

### Task 6: The acceptance run, and the handoff

- [ ] `npx tsc --noEmit`; `npm run check`; a fresh app; `npm run probe:all`.
- [ ] `docs/architecture.md`: the text is a store, and what that means for "the
  document text is the only source of truth" — the store *is* the text, and
  `getText()` is a view of it.
- [ ] Append the handoff: what changed, what the new check pins, and what is left —
  lazy block offsets through a line index, and the two history follow-ons P5 recorded.

---

## Part 4 — notes for the implementer

- The checks are the phase's spine: a store and a split are pure, so Node can drive
  thousands of edits through them and compare against a string, which is the
  strongest evidence available for "nothing changed".
- Do not let the store leak into the callers' types: `getText()` keeps returning a
  string. `slice(from, to)` is there if a caller wants one, but changing callers is
  not this phase.
- The caret, the source mode and the renderer are offset-based and must not learn
  about pieces. If a change would make one of them ask the store a question the old
  `string` could not answer, the design has gone wrong.
