# Incremental history Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** undo and redo that remember the *edits*, not the document. Today every
keystroke stores two copies of the whole text (`HistoryEntry { before, after }`,
`state.ts`), so a 320 KB note costs ~640 KB per keystroke and the history is
uncapped. A delta is a few bytes, and it makes the log readable, replayable and
invertible — which is what a later "show me what changed" or a collaborative phase
would need.

**Architecture:** a `History` of invertible edits (`from`, `to`, `removed`,
`inserted`) with a cursor. `state.ts` records the delta of every change it already
computes (`replaceRange` knows the removed text; `setText` is one whole-document
delta), and `undo`/`redo` apply the inverse or the edit through the same
`updateText` the document already uses — so the block split, the parse cache and
the renderer keep working exactly as they do.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** this document's part 1. There is no separate design doc: the phases so
far implemented `docs/superpowers/specs/2026-09-21-markdown-editor-architecture-design.md`,
which names history only as a file in the target layout (`document/history.ts`).
Part 1 below is the design to review before any task is executed; parts 2–4 are
the plan.

## Global Constraints

- **Behaviour is preserved.** One undo step per edit; a new edit truncates the
  redo tail; `loadText` clears the history; undo across a document swap is still
  impossible because the history starts empty; the caret is restored the way
  `markdown_editor.ts: applyHistory` restores it today (the offset the caret had
  before the undo, clamped to the document). No cap is introduced: the old
  implementation had none because snapshots were the problem, and deltas are small.
- The document text stays the only source of truth. The history is a *derivation*
  of it: at every point, replaying the log from the loaded text must reproduce the
  current text.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` keeps its
  count (59/59 passing, 6 skipped) from a freshly started app.
- Commit style: `refactor(history): …`, `test: …`, `docs: …`.

---

## Part 1 — the design

### 1.1 What is there today

```ts
// src/ui/markdown/state.ts
interface HistoryEntry { before: string; after: string }   // two whole documents
private readonly history: HistoryEntry[] = [];
private historyIndex = 0;

replaceRange(from, to, replacement)  // records { before, after }
setText(text)                        // records { before, after }
undo() / redo()                      // updateText(before | after)
```

Evidence: `state.ts:23–28` (the entry and why), `state.ts:46–47`, `state.ts:100–170`.
Every mutation in the editor funnels through those two methods — `applyEdit`
(`editing/context.ts`), the task checkbox (`editing/text_commands.ts`), the find
bar (`editing/find_controller.ts`), inline formatting (`editing/formatting.ts`) —
which is why the history can be built in one place.

### 1.2 The edit

```ts
interface DocumentEdit {
  /** Where the change starts, in the pre-edit text. */
  from: number;
  /** Where it ends, in the pre-edit text. `from === to` for an insertion. */
  to: number;
  /** The text that was there; empty for an insertion. */
  removed: string;
  /** The text that replaced it; empty for a deletion. */
  inserted: string;
}
```

An edit is its own inverse, exchanged: `inverse(edit) = { from: edit.from, to:
edit.from + edit.inserted.length, removed: edit.inserted, inserted: edit.removed }`.
That single property is the whole reason undo needs no snapshots, and it is the
first thing the check asserts.

### 1.3 Where the edits come from

- `replaceRange(from, to, replacement)` already clamps the range and slices the
  old text; it records `{ from: start, to: end, removed: text.slice(start, end),
  inserted: replacement }` — note the *clamped* offsets, so the log matches the
  text that changed.
- `setText(text)` is used by two commands that compute a whole new document
  (inline formatting and find-replace-all). It stays, and records one whole-document
  edit (`{ from: 0, to: old.length, removed: old, inserted: text }`): still one
  undo step, still exact, and rare enough that its size does not matter. Changing
  those two commands to range edits is not part of this phase.
- `loadText` clears the history, as today.

### 1.4 Applying history without recording it

`undo` takes the inverse of the edit below the cursor and `redo` takes the edit at
the cursor, and both go through the existing `updateText` — never through
`replaceRange`, so undo cannot record itself. `updateText` re-splits the blocks and
clears the label cache; the parse cache is keyed by *content*, so an undo back to
text seen before reuses the parses it had.

### 1.5 The layout decision §5 asked for

The design document's target layout puts `state.ts` and `blocks.ts` in
`document/`, and adds `history.ts` beside them. This phase is the right moment,
because history is the third owner of the document model — and it is the wrong
moment to sweep `render/` into a folder, which nothing needs. So: create
`src/ui/markdown/document/` and move the two files into it in Task 3, with
`history.ts` already there from Task 2. If review decides against the move, only
Task 4 disappears; nothing else in the plan depends on it.

### 1.6 What is already incremental, and what is not

Asked while planning: is incremental *rendering* in place? Yes, and it has been
since before P0. `virtual_block_renderer.ts: renderChanged` compares each mounted
element against its block's content key and drops only the ones that changed; the
parse cache (`state.ts: blockContent`) and the measured heights (`block_sizes.ts`)
are keyed the same way, so an edit — including a paste that adds several blocks —
rebuilds the blocks it touched and leaves the rest of the DOM alone. Task 1's probe
asserts exactly that, by element identity, rather than by watching a stopwatch.

What is *not* incremental is the text: `replaceRange` builds the new document with
`slice` and `splitBlocks` re-splits every line, so an edit costs O(document) in
memory traffic even though the rendering is O(change). A rope or a piece table
would fix that. It is not this phase, and history does not need it: a delta log is
small either way.

---

## Part 2 — what the tree has today

| Thing | Where | Note |
| --- | --- | --- |
| The text, the blocks, the history | `state.ts` (276 lines) | the history is an array of whole-document pairs |
| The block split | `blocks.ts` | imported by 18 modules, 14 of them type-only |
| Who mutates the document | `state.replaceRange`, `state.setText` | five call sites, all inside `editing/` |
| The checks that name a path | `test/checks/check-blocks.mjs` (`blocks.ts`) | `layering.mjs` and `headers.mjs` walk the tree and do not care |

---

## Part 3 — tasks

### Task 1: The paste cases, before anything about history changes

**Files:**
- Create: `test/probes/paste-blocks.js`
- Modify: `src/ui/markdown/editing/clipboard.ts`, `src/ui/markdown/editing/blank_lines.ts`

**Interfaces:**

- Produces: `pasteInsertion(text: string, from: number, to: number, pasted: string): string`
  in `editing/blank_lines.ts` — what a paste replaces the range with. A paste that
  carries its own paragraph breaks (`\n[ \t]*\n`) is a *block* paste and gets the
  blank lines a block needs at each seam (`blockPadding`); anything else is spliced
  exactly as written, which is what a one-line paste, or one paragraph broken across
  lines, has always done.

- [ ] **Step 1: Write the probe (RED)**

Copy two paragraphs — a real selection across blocks — then paste it in each of the
four places, asserting the document, the caret, and that the blocks the paste did
not touch kept their DOM elements (which is the incremental rendering, measured):

```js
// copy:  select from the start of the first paragraph to the start of the third,
//        dispatch `copy`, keep its DataTransfer
// paste: click `where`, dispatch `paste` with that DataTransfer
check('at the start of a paragraph the pasted blocks stay blocks',
  raw, 'one\n\ntwo\n\nAlpha beta\n\ngamma\n');
check('in the middle the paragraph splits around them',
  raw, 'Al\n\none\n\ntwo\n\npha beta\n\ngamma\n');
check('at the end they follow the paragraph',
  raw, 'Alpha beta\n\none\n\ntwo\n\ngamma\n');
check('on a blank line the line becomes them',
  raw, 'alpha\n\none\n\ntwo\n\ngamma\n');
check('one line pasted mid-word is spliced as it is', raw, 'AlphaXbeta\n');
check('the blocks the paste did not touch keep their elements',
  after.farBlock === before.farBlock, true);
```

Run it: the four block cases fail today — a multi-paragraph paste is spliced into
the words around it (`Alone\n\ntwopha`), because only the blank-line case is
block-aware.

- [ ] **Step 2: The rule, and the wiring**

`pasteInsertion` in `blank_lines.ts`, where the paragraph-break facts live, and
`pasteText` uses it for the non-blank-line path; the caret goes after the pasted
text, before the trailing blank lines. The blank-line path keeps
`materializeInsertion`, which already turns the line into the pasted content.

- [ ] **Step 3: Verify** — `npx tsc --noEmit`, `npm run check` (16/16), the probe by
  name, and the existing paste-free probes untouched.

- [ ] **Step 4: Commit** — `fix(editor): a paste that carries paragraph breaks lands as blocks`

### Task 2: The `History` module, and the check that pins its algebra

**Files:**
- Create: `src/ui/markdown/history.ts`, `test/checks/check-history.mjs`

**Interfaces:**

- Produces: `DocumentEdit` (`from`, `to`, `removed`, `inserted`), `invert(edit): DocumentEdit`,
  `class History` — `record(edit: DocumentEdit): void` (truncates the redo tail),
  `undo(): DocumentEdit | null` (the *inverse* to apply), `redo(): DocumentEdit | null`,
  `clear(): void`, `canUndo(): boolean`, `canRedo(): boolean`, `length: number`,
  `edits(): readonly DocumentEdit[]`.
- Consumes: nothing. The module is pure — no DOM, no state.

- [ ] **Step 1: Write the check (RED)**

`test/checks/check-history.mjs` bundles the module and asserts:

```js
const insert = (at, text) => ({ from: at, to: at, removed: '', inserted: text });
const replace = (from, to, removed, inserted) => ({ from, to, removed, inserted });

check('an edit inverts to the edit that undoes it', invert(insert(3, 'ab')),
  { from: 3, to: 5, removed: 'ab', inserted: '' });
check('inverting twice is the edit again', invert(invert(replace(2, 4, 'cd', 'xy'))),
  replace(2, 4, 'cd', 'xy'));

const log = new History();
log.record(insert(0, 'a'));
log.record(insert(1, 'b'));
check('undo hands back the inverse of the last edit', log.undo(), invert(insert(1, 'b')));
check('and the cursor is where it was', [log.canUndo(), log.canRedo()], [true, true]);
check('redo hands back the edit itself', log.redo(), insert(1, 'b'));
log.undo();
log.record(insert(1, 'c'));
check('a new edit truncates the redo tail', [log.canRedo(), log.length], [false, 2]);
check('redo at the end returns null', log.redo(), null);
check('undo walks back through the log', [log.undo() !== null, log.undo() !== null], [true, true]);
check('undo at the start returns null', log.undo(), null);
check('and redo walks forward again', log.redo(), insert(0, 'a'));
log.clear();
check('clear() empties both directions', [log.canUndo(), log.canRedo(), log.length], [false, false, 0]);

// The point of the phase, as a property of the log rather than a benchmark:
const typed = new History();
typed.record(insert(0, 'x'));                    // as if typed in a 1000-line note
check('a one-character edit is a one-character entry',
  JSON.stringify(typed.edits()).length < 60, true);
```

- [ ] **Step 2: Write the module**

The header takes the house shape; the body is a cursor over an array, with
`record` splicing the tail exactly as `recordHistory` does today.

- [ ] **Step 3: Verify and commit** — `npx tsc --noEmit`, `npm run check` (16/16),
  commit `refactor(history): keep the edits, not the document`.

### Task 3: The state records deltas, and undo applies them

**Files:**
- Modify: `src/ui/markdown/state.ts`
- Modify: `test/checks/check-history.mjs` (a case for a `MarkdownEditorState`'s log)

**Interfaces:**

- Consumes: `History`, `DocumentEdit`, `invert` from Task 2.
- Produces: the same public surface as today (`undo()`, `redo()`, `replaceRange`,
  `setText`, `loadText`) plus, for tests, `historyEdits(): readonly DocumentEdit[]`.

- [ ] **Step 1: Replace the entries**

`HistoryEntry` goes; `replaceRange` and `setText` record an edit; `undo`/`redo`
call `updateText` with the inverse or the edit and move no cursor themselves (the
`History` owns the cursor).

- [ ] **Step 2: The check, in Node**

Bundle `state.ts` (with the DOM stubs `check-enter.mjs` uses) and assert the
behaviour that used to be the snapshot's: a `replaceRange` then `undo()` restores
the text, `redo()` re-applies it, a second edit truncates the redo tail, and the
log holds one entry per edit.

- [ ] **Step 3: Verify** — `npx tsc --noEmit`, `npm run check` (16/16), and against
  a freshly started app: `regression-undo`, `edit-stability`, `regression-list`,
  `footnote-enter`, `table-cells`.

- [ ] **Step 4: Commit** — `refactor(history): record the edit instead of the document`

### Task 4: `document/`, the home §5 promised

**Files:**
- Move: `src/ui/markdown/state.ts` → `src/ui/markdown/document/state.ts`,
  `src/ui/markdown/blocks.ts` → `src/ui/markdown/document/blocks.ts`,
  `src/ui/markdown/history.ts` → `src/ui/markdown/document/history.ts`
- Modify: the 18 importers (14 are `import type`), `test/checks/check-blocks.mjs`,
  `docs/architecture.md`, `docs/ai-context.md`

**Interfaces:** none change. This task is paths.

- [ ] **Step 1: `git mv` the three files**, then fix the relative imports
  (`./blocks` → `../document/blocks` and so on). `rg -n "from '.*(state|blocks|history)'" src`
  is the worklist.
- [ ] **Step 2: The check that names a path** — `check-blocks.mjs` bundles
  `src/ui/markdown/document/blocks.ts`. The other checks walk the tree.
- [ ] **Step 3: The maps** — `docs/architecture.md`'s layer table and
  `docs/ai-context.md`'s rows name `document/`; the "change goes where" row for the
  document model follows.

- [ ] **Step 4: Verify** — `npx tsc --noEmit`, `npm run check` (16/16), probes
  `default-document`, `fixture-large-document`, `block-gaps`.

- [ ] **Step 5: Commit** — `refactor(document): give the document model its folder`

### Task 5: The probe for the seam — undo after the window moved

**Files:**
- Create: `test/probes/undo-after-scroll.js`
- Modify: `docs/architecture.md` (the history invariant), `test/README.md` (the index)

**Interfaces:** none.

- [ ] **Step 1: The probe**

Load a document long enough to virtualise (the `@needs-large-document` fixture or a
generated one), type into a block near the top, scroll far away so that block
unmounts, undo, and assert: the text is back, the caret is restored, and the
window still holds the document (the renderer did not mount everything). This is
the join between two subsystems that are each tested on their own, and the place
the snapshot implementation was accidentally safe.

- [ ] **Step 2: The invariant, written down**

One paragraph in `docs/architecture.md`: the document text is the only source of
truth and the history is a derivation of it — `replaceRange` and `setText` are the
only places an edit is recorded, `updateText` is the only place a text is applied
(so undo cannot record itself), and the parse cache is keyed by content, which is
what lets an undo reuse the parses of the text it returns to.

- [ ] **Step 3: Verify** — the probe by name, and `npm run probe:all`.

- [ ] **Step 4: Commit** — `test(history): prove undo across a window move`

### Task 6: The phase's acceptance run, and the handoff

- [ ] `npx tsc --noEmit`; `npm run check`; fresh app; `npm run probe:all`.
- [ ] Append the handoff to this plan: what changed, what the check enforces, what
  a later phase could do next (store the caret in the edit; coalesce typing into
  one step per word — both are behaviour changes and need their own phase).
- [ ] Commit — `docs: close the incremental history handoff`

---

## Part 4 — notes for the implementer

- The design is the deliverable of part 1 and the plan is part 3: if review
  changes the design, change part 1 first, then the tasks that depend on it.
- Do not "fix" the two whole-document `setText` callers in this phase; they are
  one undo step each and the note above says why they stay.
- The snapshot implementation was accidentally safe in one place this one is not:
  `updateText` never had to know *which* text it was applying. Keep the record and
  the apply apart — `replaceRange` records, `updateText` applies — and undo cannot
  feed itself.
- Probes are the safety net again: a delta that is off by one byte still compiles.
  Restart `npm run tauri dev` before the acceptance run.
