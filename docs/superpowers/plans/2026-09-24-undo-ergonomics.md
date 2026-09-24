# Undo Ergonomics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** undo and redo put the caret where the author was, and a word of typing is
one step — in any script.

**Architecture:** `DocumentEdit` gains two optional carets (`caretBefore`,
`caretAfter`), which `applyEdit` already knows, `invert` swaps, and `applyHistory`
places; and `History.record` takes an `EditKind` so that a run of typing or of
deleting merges into its predecessor. The merge rule is pure and lives in
`document/history.ts`: same kind, adjacent in the direction that kind grows, single
characters, and a step boundary at the first character that is not a letter — any
script's letter, so a space and a `。` both close a word — with a length cap so a
script without spaces still breaks into steps.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** this document's part 1; `docs/roadmap.md`'s undo-ergonomics item, which
names P5's handoff as its source.

## Global Constraints

- **Behaviour changes are the phase.** The document text, blocks, rendering and
  caret offsets stay exact; what changes is which offset the caret gets after an
  undo, and how many keystrokes one step holds.
- **The offsets do not move.** `getText()`, `getBlocks()`, `getBlockAtOffset`,
  `getBlockAtLine`, `getBlockContent`, `historyEdits()` keep their signatures and
  their meaning; `undo()` and `redo()` hand back the edit they applied instead of
  `true`, which every caller's truthiness check still reads correctly.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` stays green,
  with the probe count growing by one.
- Commit style: `test(…): …`, `feat(…): …`, `docs: …`, and a `merge:` commit.

---

## Part 1 — the design

### 1.1 What is wrong today

`DocumentEdit` is `{from, to, removed, inserted}`, so `markdown_editor.ts:
applyHistory` places the caret at the offset it *currently* has, clamped: undo after
clicking elsewhere leaves you where you clicked. And every edit is its own step
(`History.record`), so "hello" is five undos; `check-history.mjs` pins that a
one-character edit is a few bytes of history.

### 1.2 The two changes

**The carets.** `applyEdit` reads the caret before the edit and already has the
target after it; `replaceRange(from, to, replacement, { carets, kind })` passes both
to `History.record`, `invert` swaps them (an undo starts where a redo ended), and
`applyHistory` places the caret from the applied edit. An edit recorded without
carets — the whole-document `setText` that formatting and find-and-replace use —
keeps today's clamp, because those commands place their own selection afterwards.

**The steps.** One run per kind: `insertText` declares `typing`, `deleteText`
`deleting`, and every other command `other`, which is a step of its own and ends the
run. A run merges its next edit when:

- the kind matches the run's, and
- it is adjacent in the direction that kind grows — an insertion starting where the
  previous one ended, a deletion ending where the previous one started (Backspace),
  or removing at the same offset (Delete), and
- **the typing rule holds**: the run so far ends with a letter (`/\p{L}$/u`), the
  new keystroke is a single character, and the merged run is at most
  `STEP_LIMIT = 24` characters.

So a letter extends the run, the first character that is not a letter is the run's
last character and closes it ("hello " is one step, "world" the next), a CJK
punctuation closes a step like a space does, a script without spaces breaks at the
cap rather than swallowing a paragraph, and a multi-character insertion — a paste,
and an input method's commit when the editor learns to take one — is a step of its
own. No timers: a caret jump ends a run by not being adjacent, which is why the
probes can test this.

### 1.3 Not this phase

Coalescing *across* a deletion and back into typing (the composed undo that trims a
run's own text), and restoring a *selection* rather than a caret when the undone
edit replaced one.

---

## Part 2 — tasks

### Task 1: The edit remembers the caret

**Files:**
- Modify: `src/ui/markdown/document/history.ts`
- Modify: `src/ui/markdown/document/state.ts`
- Modify: `src/ui/markdown/editing/context.ts`
- Modify: `src/ui/markdown/markdown_editor.ts`
- Modify: `test/checks/check-history.mjs`

**Interfaces:**

- Produces: `DocumentEdit`'s optional `caretBefore`/`caretAfter`;
  `replaceRange(from, to, replacement, options?: { carets?: { before: number; after: number } })`;
  `undo(): DocumentEdit | null` and `redo(): DocumentEdit | null`.

- [ ] **Step 1: The carets on the edit, and through the inverse**

```ts
export interface DocumentEdit {
  from: number;
  to: number;
  removed: string;
  inserted: string;
  /** The caret the edit started from; absent for an edit made without one. */
  caretBefore?: number;
  /** The caret the edit left behind. */
  caretAfter?: number;
}

/** The edit that undoes `edit`. */
export function invert(edit: DocumentEdit): DocumentEdit {
  const inverted: DocumentEdit = {
    from: edit.from,
    to: edit.from + edit.inserted.length,
    removed: edit.inserted,
    inserted: edit.removed
  };
  if (edit.caretBefore !== undefined) {
    inverted.caretBefore = edit.caretAfter;
  }
  if (edit.caretAfter !== undefined) {
    inverted.caretAfter = edit.caretBefore;
  }
  return inverted;
}
```

- [ ] **Step 2: Record them, hand the edit back, and place the caret from it**

`state.ts`: `replaceRange(from, to, replacement, options: { carets?: { before: number; after: number } } = {})`
builds `{ from, to, removed, inserted, caretBefore: options.carets?.before, caretAfter: options.carets?.after }`
(only when given, so an edit without carets has neither key) and `undo()`/`redo()`
return the edit they applied (`DocumentEdit | null`) instead of `true`.

`editing/context.ts: applyEdit` reads `caretOffset(context)` before the edit and
passes `{ carets: { before, after: target } }`.

`markdown_editor.ts: applyHistory`:

```ts
    const fallback = caretOffset(this.context) ?? this.state.getText().length;
    const anchor = this.contentView.scrollTop;
    const edit = direction === 'undo' ? this.state.undo() : this.state.redo();
    if (!edit) {
      return;
    }
    // The edit remembers where the author was: undoing puts the caret back where the
    // change started, redoing where it left it. An edit recorded without carets keeps
    // the caret where it is.
    const remembered = direction === 'undo' ? edit.caretBefore : edit.caretAfter;
    const target = Math.min(remembered ?? fallback, this.state.getText().length);
```

- [ ] **Step 3: The check, and the run**

`check-history.mjs` gains: `invert` swaps the carets (an edit with both, and one with
neither, whose inverse has neither); an edit recorded with carets is handed back by
`undo()` with them swapped; and `typed.edits()` still reads as a few bytes.

Run: `node test/checks/check-history.mjs && node test/run-checks.mjs`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/ui/markdown/document/history.ts src/ui/markdown/document/state.ts src/ui/markdown/editing/context.ts src/ui/markdown/markdown_editor.ts test/checks/check-history.mjs
git commit -m "feat(document): an edit remembers the caret it started from"
```

### Task 2: A word of typing is one step

**Files:**
- Modify: `src/ui/markdown/document/history.ts`
- Modify: `src/ui/markdown/document/state.ts`
- Modify: `src/ui/markdown/editing/context.ts`
- Modify: `src/ui/markdown/editing/text_commands.ts`
- Modify: `test/checks/check-history.mjs`

**Interfaces:**

- Produces: `type EditKind = 'typing' | 'deleting' | 'other'`;
  `coalesceRun(previous: DocumentEdit, next: DocumentEdit, kind: EditKind, limit?: number): DocumentEdit | null`
  (the merged edit, or null when the run ends);
  `History.record(edit, kind?: EditKind)`;
  `replaceRange(…, options?: { carets?; kind?: EditKind })`;
  `applyEdit(…, kind?: EditKind)`.

- [ ] **Step 1: The rule, in the check first (RED)**

```js
const { coalesceRun } = history;
const letter = (from, at, caret) => ({ from, to: from, removed: '', inserted: at, caretBefore: caret, caretAfter: caret + 1 });

check('two letters in a row are one step',
  coalesceRun(letter(4, 'h', 4), letter(5, 'e', 5), 'typing'), letter(4, 'he', 4));
check('a space joins the word and closes it',
  coalesceRun(letter(4, 'he', 4), letter(6, ' ', 6), 'typing').inserted, 'he ');
check('so the next letter starts a new step',
  coalesceRun({ ...letter(4, 'he ', 4), to: 7, removed: '' }, letter(7, 'w', 7), 'typing'), null);
check('a caret jump is not adjacent', coalesceRun(letter(4, 'h', 4), letter(20, 'e', 20), 'typing'), null);
check('another kind does not merge', coalesceRun(letter(4, 'h', 4), letter(5, 'e', 5), 'deleting'), null);
check('a letter that is not Latin merges too',
  coalesceRun(letter(0, '你', 0), letter(1, '好', 1), 'typing').inserted, '你好');
check('and a CJK full stop closes the step',
  coalesceRun({ ...letter(0, '你好。', 0), to: 3 }, letter(3, '好', 3), 'typing'), null);
check('a paste is a step of its own',
  coalesceRun(letter(0, 'a', 0), { from: 1, to: 1, removed: '', inserted: 'word' }, 'typing'), null);
check('backspaces merge as deletions',
  coalesceRun({ from: 1, to: 2, removed: 'b', inserted: '', caretBefore: 2, caretAfter: 1 }, { from: 0, to: 1, removed: 'a', inserted: '', caretBefore: 1, caretAfter: 0 }, 'deleting'),
  { from: 0, to: 2, removed: 'ab', inserted: '', caretBefore: 1, caretAfter: 0 });
check('a run stops at the cap',
  coalesceRun({ from: 0, to: 0, removed: '', inserted: 'x'.repeat(24) }, letter(24, 'x', 24), 'typing'), null);
```

(Write the expectations to match the rule as implemented; the caret pair of a merged
run is the first edit's `caretBefore` and the last one's `caretAfter`.)

Run: `node test/checks/check-history.mjs`
Expected: FAIL — `coalesceRun` is not a function.

- [ ] **Step 2: The rule, and the run in the History**

```ts
/** What a keystroke was: a run of one kind becomes one undo step. */
export type EditKind = 'typing' | 'deleting' | 'other';

/** How many characters one run may hold, so a script without spaces still breaks. */
export const STEP_LIMIT = 24;

/**
 * The edit one step holds when `next` continues the run `previous` is in, or null
 * when the run ends here.
 *
 * A run is one kind of keystroke, adjacent in the direction that kind grows, and for
 * typing it is a word: the run ends *after* the first character that is not a letter,
 * so a space or a full stop belongs to the word it follows. Letters are `\p{L}`, any
 * script's.
 */
export function coalesceRun(
  previous: DocumentEdit,
  next: DocumentEdit,
  kind: EditKind,
  limit: number = STEP_LIMIT
): DocumentEdit | null {
  if (kind === 'other') {
    return null;
  }
  if (kind === 'typing') {
    if (next.from !== previous.to || next.to !== next.from || previous.inserted === '') {
      return null;
    }
    if (next.inserted.length !== 1 || previous.inserted.length + 1 > limit) {
      return null;
    }
    if (!/\p{L}$/u.test(previous.inserted)) {
      return null;
    }
    return merged(previous, next, `${previous.inserted}${next.inserted}`);
  }
  if (next.inserted !== '' || previous.inserted !== '') {
    return null;
  }
  if (next.to === previous.from) {
    return merged(previous, next, previous.removed, next.removed, 'removed');
  }
  if (next.from === previous.from && next.to > previous.to) {
    return merged(previous, next, previous.removed, next.removed, 'removed');
  }
  return null;
}
```

with a small `merged` helper that keeps the outer range (`min(from)`, `max(to)`), the
first `caretBefore` and the last `caretAfter`, and joins the two texts in the order
the offsets ask for. `History.record(edit, kind = 'other')` keeps `private lastKind`
and, when the kind is not `other` and matches, replaces the last entry with
`coalesceRun(last, edit, kind)` when it is not null; every other record pushes a new
entry and resets `lastKind`.

- [ ] **Step 3: The commands declare their kind**

`editing/text_commands.ts`: `insertText` calls
`applyEdit(context, offsets.from, offsets.to, text, undefined, 'typing')` and
`deleteText` likewise `'deleting'`; `context.ts: applyEdit(…, kind: EditKind = 'other')`
passes it on with the carets; `state.ts: replaceRange`'s options gain `kind`.
Everything else — a newline, a paste, a format, find-and-replace, a table command —
keeps the default, which is a step of its own and ends any run.

Run: `node test/checks/check-history.mjs && node test/run-checks.mjs`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/ui/markdown/document/history.ts src/ui/markdown/document/state.ts src/ui/markdown/editing/context.ts src/ui/markdown/editing/text_commands.ts test/checks/check-history.mjs
git commit -m "feat(document): a word of typing is one undo step"
```

### Task 3: The probe, the docs, the acceptance

**Files:**
- Create: `test/probes/undo-typing.js`
- Modify: `test/README.md`, `docs/architecture.md`, `docs/roadmap.md`, this plan

**Interfaces:**

- Produces: the phase's evidence.

- [ ] **Step 1: The probe**

```js
/**
 * What one undo takes back, and where the caret is afterwards.
 *
 * Two cases: a word of typing is one step, and a step is a *step in the document* —
 * undo puts the caret back where the typing began, not where the reader left it. The
 * caret is checked by typing a letter after the undo and reading where it landed,
 * which is the only thing a caret means.
 *
 * @covers src/ui/markdown/document/history.ts, src/ui/markdown/markdown_editor.ts
 */
(async () => {
  const t = window.__t;
  const out = t.report({});
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const undo = async () => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'undo' });
    await t.sleep(250);
  };
  /** Puts the caret inside `needle`, `inside` characters in. */
  const caretAt = async (needle, inside) => {
    const block = t.blocks()[0];
    const node = t.textNodesIn(block).find((leaf) => leaf.data.includes(needle));
    const range = document.createRange();
    range.setStart(node, node.data.indexOf(needle) + inside);
    range.collapse(true);
    const box = range.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: box.left, clientY: box.top + box.height / 2 })
    );
    await t.sleep(150);
  };

  // A word per step: "hello " is one undo, "world" the next.
  await t.load('one two\n');
  await caretAt('one', 3);
  for (const key of ['h', 'e', 'l', 'l', 'o', ' ', 'w', 'o', 'r', 'l', 'd']) {
    t.key(key);
  }
  await t.sleep(300);
  out.typed = await t.raw();
  await undo();
  out.afterOneUndo = await t.raw();
  await undo();
  out.afterTwoUndos = await t.raw();
  check('a word of typing is one step', out.afterOneUndo === 'onehello two\n', out.afterOneUndo);
  check('and the step before it is the word before',
    out.afterTwoUndos === 'one two\n', out.afterTwoUndos);

  // The caret: type in one place, leave, undo, and type again.
  await t.load('A paragraph with fairly plain words in it.\n\nsecond\n');
  await caretAt('fairly', 3);
  t.key('x');
  await t.sleep(250);
  await caretAt('words', 2);
  await undo();
  t.key('y');
  await t.sleep(250);
  out.caret = await t.raw();
  check('undo puts the caret back where the typing was',
    out.caret === 'A paragraph with faiyrly plain words in it.\n\nsecond\n', out.caret);
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
```

The caret starts at the end of `one`, so the typing goes there: one undo takes back
`world`, the next takes back `hello ` — the word and its space.

Run: `npm run probe -- test/probes/undo-typing.js`
Expected: `failed: []`.

- [ ] **Step 2: The probes this changes, and the rest of the suite**

One at a time: `regression-undo`, `undo-after-scroll`, `paste-blocks`,
`empty-line-editing`, `table-cell-typing`, `edit-stability`, `plain-edit-parse`.
Expected: the same results, except where a probe counted keystrokes as steps — read
each one's report rather than assuming.

- [ ] **Step 3: The docs**

`docs/architecture.md`'s undo/redo paragraph: an edit remembers the caret it started
from and the one it left, and a run of typing or deleting is one step, with the
letter/`STEP_LIMIT` rule and the note that it is script-neutral.
`docs/roadmap.md`: the undo-ergonomics item moves to Closed with what it did.

- [ ] **Step 4: Acceptance, handoff, merge**

```bash
npx tsc --noEmit
npm run check                                   # 20/20 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 68/68 probes, 6 skipped
```

Append the handoff to this plan (what changed, the rule with its Unicode and cap
notes, the probe's two cases, what is left — coalescing across kinds and selections),
commit it with the docs, then:

```bash
git checkout main
git merge --no-ff codex/undo-ergonomics -m "merge: a word of typing is one undo step (undo ergonomics)"
git rev-parse HEAD^{tree} codex/undo-ergonomics^{tree}   # must be equal
```

Keep the branch, and report the tree hash.
