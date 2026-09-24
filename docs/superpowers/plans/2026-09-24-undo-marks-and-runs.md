# Undo Marks and Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the two leftovers P12's handoff names. A Backspace that takes back the
characters a run of typing wrote *trims that run* rather than starting a step of its
own, so typing a word and deleting it again leaves no step at all. And an edit remembers
where the author was as a **mark** — a caret, or the selection the edit replaced — so
undo puts the selection back rather than a caret at the start of it.

**Architecture:** both live in the edit algebra (`document/history.ts`), which is pure
and checked in Node. `coalesceRun` gains the cross-kind case: a deletion that removes the
last character a run itself inserted shortens the run's text, and a run shortened to
nothing is dropped from the log. `DocumentEdit`'s two caret offsets become two marks
(`before`, `after`), each a pair of ends that meet for a caret, so `invert` is a swap and
coalescing is a composition, both without special cases. The editing layer supplies the
mark from the live selection and restores it: a selection is placed with the range
machinery `formatting.ts` had privately, moved into its one home.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** the "what is left" note in `docs/superpowers/plans/2026-09-24-undo-ergonomics.md`,
and `docs/roadmap.md`.

## Global Constraints

- **The document text stays the only source of truth.** Both changes are about what the
  history *remembers* and where the caret or selection *lands*; an undo is still a range
  replacement applied through `state.ts: updateText`, and still cannot record itself.
- The two whole-document commands (`state.ts: setText` — inline formatting, find and
  replace all) keep recording no marks, so undoing one keeps today's behaviour. The
  handoff names that boundary rather than leaving it to be discovered.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` stays green on a
  freshly started app.
- Commit style: `feat(…): …`, `fix(…): …`, `test(…): …`, `docs: …`, and a `merge:`
  commit.

---

## Part 1 — the design

### 1.1 A Backspace that takes back the run's own characters

A run is the author's burst of one kind, so the step it leaves should be the text that
survived the burst:

- typed "hello", pressed Backspace twice → the step holds "hel", and one undo takes
  those three characters. Today it is two steps: undo restores "llo", undo again removes
  "hello" — walking back through letters that had already been deleted.
- typed "hello", deleted all five → nothing was typed in the end, so the burst is no
  step at all and the next undo goes to whatever came before it.

The rule, in `history.ts` next to the same-kind one:

```ts
/** The typing run `next` takes one character back off, or null when it does not. */
export function trimRun(previous: DocumentEdit, next: DocumentEdit): DocumentEdit | null {
  if (previous.inserted === '' || next.inserted !== '') return null;      // insertion run, deletion
  const end = previous.from + previous.inserted.length;
  if (next.from !== end - 1 || next.to !== end) return null;              // Backspace at the run's end
  if (next.to - next.from !== next.removed.length) return null;           // one character
  if (next.removed !== previous.inserted.slice(-1)) return null;          // its own text
  return { ...previous, inserted: previous.inserted.slice(0, -1), ...marks(previous, next) };
}
```

Everything else stays a step of its own: a Backspace that reaches *past* the run into the
document's own characters, a Delete, a caret that moved away and back, a paste. A run
trimmed to nothing (`inserted === ''` and `removed === ''`) is a no-op edit, and
`History.record` **drops the step** instead of pushing an empty one. A run that had
replaced text is *not* a no-op when it is trimmed away: it keeps its `removed`, which is
the deletion the author ended up making.

The trimmed step is still a typing run, so "hel", Backspace, "l" is one step again — a
trim does not close the run it belongs to.

### 1.2 The mark: a caret, or the selection an edit replaced

`caretBefore`/`caretAfter` are single offsets, so an edit that replaced a selection can
remember only one end of it, and undo can only put a caret at its start. The fact worth
storing is where the author *was*:

```ts
/**
 * Where an edit's author stood, and where it left them: a caret is a mark whose ends
 * meet, a selection is the range the author had.
 */
export interface EditMark {
  from: number;
  to: number;
}
```

`DocumentEdit` carries `before?: EditMark` and `after?: EditMark`. Then:

- `invert` **swaps** the marks instead of exchanging two optionals, and a selection
  survives the swap as a selection.
- `coalesceRun` and `trimRun` compose them the one way — `before` from the first edit,
  `after` from the last — and the `caretsOf` helper they shared goes away.
- `markdown_editor.ts: applyHistory` restores `edit.after`: a caret for a collapsed
  mark, and for a selection `context.ts: restoreSelection` — the range placement
  `formatting.ts` had privately (`formatting.ts: restoreSelection`), moved to its one
  home and called by both. The caret is anchored at the mark's end, exactly as
  formatting already anchors it, so the next command has somewhere to start.
- `applyEdit` says where the author was: `context.ts: authorMark` maps
  `editorSelection` through `rangeOffsets`, so a collapsed caret gives `{ from: x, to: x }`
  and a drag gives both ends. When the map fails, the edit keeps the offset fallback it
  has today.

In the app this is: select "world", type "there", undo → "world" is back **and
selected**, ready to be typed over. Undoing a Backspace still leaves a caret, because
the author had a caret when they pressed it.

---

## Part 2 — tasks

### Task 1: the run that takes itself back

**Files:**
- Modify: `src/ui/markdown/document/history.ts`
- Modify: `test/checks/check-history.mjs`
- Add: `test/probes/undo-run-taken-back.js`

**Interfaces:**

- Produces: `trimRun(previous, next)`, exported beside `coalesceRun`; `History.record`
  admits the cross-kind case and can drop the step it was in.

- [x] **Step 1: The rule**

`trimRun` as in §1.1, with the header comment saying what makes a Backspace a trim (it
takes back the run's *own* last character, from the run's own end) and what the rule
leaves alone.

- [x] **Step 2: The log**

In `History.record`, a merge is offered to `coalesceRun` when the kind matches and to
`trimRun` when the last step was typing and this one is a deletion; a merged step whose
text is empty is dropped:

```ts
    if (previous) {
      const merged =
        kind === this.lastKind
          ? coalesceRun(previous, edit, kind)
          : this.lastKind === 'typing' && kind === 'deleting'
            ? trimRun(previous, edit)
            : null;
      if (merged) {
        // A run that took back the last of its own text leaves nothing to undo.
        if (merged.inserted === '' && merged.removed === '') {
          this.log.length = this.cursor - 1;
          this.cursor -= 1;
          this.lastKind = 'other';
          return;
        }
        this.log[this.cursor - 1] = merged;
        return;
      }
    }
```

- [x] **Step 3: The checks**

`check-history.mjs`, in the run section: a Backspace at the run's end trims it; one that
reaches past it, a Delete, and a caret that moved do not; a run trimmed to nothing leaves
no step, while a run that had replaced text keeps that deletion; and the letters typed
after a trim join the same step.

```bash
npm run check
```

- [x] **Step 4: The probe**

`test/probes/undo-run-taken-back.js`, four cases:

1. type "alpha", Backspace twice, one undo takes the three characters that survived;
2. type "beta" after an Enter, delete all four — one undo takes the *Enter*, because the
   burst is no step at all (the observable that separates "no step" from "an empty step");
3. Delete after typing is a step of its own: undo restores the character it removed, and
   the next undo takes the run;
4. a letter typed after a trim joins the same step.

```bash
npm run probe -- --fixture default-document.md test/probes/undo-run-taken-back.js
```

- [x] **Step 5: Commit**

```bash
git add src/ui/markdown/document/history.ts test/checks/check-history.mjs test/probes/undo-run-taken-back.js
git commit -m "feat(undo): a backspace takes back the run's own text"
```

### Task 2: the mark an edit remembers

**Files:**
- Modify: `src/ui/markdown/document/history.ts`
- Modify: `src/ui/markdown/document/state.ts`
- Modify: `src/ui/markdown/editing/context.ts`
- Modify: `src/ui/markdown/editing/formatting.ts`
- Modify: `src/ui/markdown/markdown_editor.ts`
- Modify: `test/checks/check-history.mjs`
- Add: `test/probes/undo-selection-return.js`

**Interfaces:**

- Produces: `EditMark`, `DocumentEdit.before`/`.after` (replacing `caretBefore`/
  `caretAfter`), `state.replaceRange(…, { marks })`, `context.ts: authorMark` and
  `context.ts: restoreSelection`.

- [x] **Step 1: The mark in the algebra**

`history.ts`: `EditMark` and the two fields; `invert` swaps them; `coalesceRun` and
`trimRun` compose them with one shared helper. `state.ts`: `replaceRange` takes
`{ marks?: { before: EditMark; after: EditMark } }`.

- [x] **Step 2: Where the author was**

`context.ts`: `authorMark(context)` from `editorSelection` + `rangeOffsets`, used by
`applyEdit` for `before` (falling back to `from`); `after` is the caret target as today.

- [x] **Step 3: Putting it back**

`context.ts`: `restoreSelection(context, from, to)` — the merged copy. `markdown_editor.ts:
applyHistory` restores `edit.after` through it when the mark is not collapsed, and
`formatting.ts` uses the same function instead of its private copy.

- [x] **Step 4: The checks**

`check-history.mjs`: an edit's marks invert with the text, a selection stays a selection
through an invert, a run composes the first edit's `before` with the last one's `after`,
and the state records the marks it was given.

```bash
npx tsc --noEmit && npm run check
```

- [x] **Step 5: The probe**

`test/probes/undo-selection-return.js`: select "world", type over it, undo → the word is
back and selected (checked through `window.getSelection()`, and the document read
*after*, because `t.raw()` selects everything); the contrast case — a Backspace undone
leaves a caret, not a selection.

```bash
npm run probe -- --fixture default-document.md test/probes/undo-selection-return.js
```

- [x] **Step 6: Commit**

```bash
git add src/ui/markdown/document/history.ts src/ui/markdown/document/state.ts \
  src/ui/markdown/editing/context.ts src/ui/markdown/editing/formatting.ts \
  src/ui/markdown/markdown_editor.ts test/checks/check-history.mjs \
  test/probes/undo-selection-return.js
git commit -m "feat(undo): an edit remembers the selection it replaced"
```

### Task 3: Acceptance, docs, handoff

- [x] **Step 1: The docs**

`docs/architecture.md`'s history section: the marks instead of the two caret offsets, and
the Backspace that trims the run it came from. `test/README.md`: the probe count and the
new names. `docs/roadmap.md`: P12's leftovers closed.

- [x] **Step 2: Acceptance**

```bash
npx tsc --noEmit
npm run check                                   # 20/20 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 70/70 probes plus the two new ones
```

- [x] **Step 3: The handoff, and the commit**

Append to this plan: what changed, the two rules, what the probes prove, the boundary the
whole-document commands keep, and what is left.

```bash
git add docs/architecture.md docs/roadmap.md test/README.md docs/superpowers/plans/2026-09-24-undo-marks-and-runs.md
git commit -m "docs: close the undo marks and runs handoff"
```

- [x] **Step 4: Merge**

```bash
git checkout main
git merge --no-ff codex/undo-across-kinds -m "merge: a run that takes itself back, a selection that comes back (undo marks)"
git rev-parse HEAD^{tree} codex/undo-across-kinds^{tree}   # must be equal
```

Keep the branch, and report the tree hash.

---

## Handoff — what this phase left

**Both of P12's leftovers are done.** What is left of undo in this repository is the
boundary named at the end of this note, and nothing else.

### The run that takes itself back

`history.ts: trimRun` is the cross-kind rule: when the last step is a typing run and the
next edit is a Backspace that removes exactly the character at the run's *end*, and that
character is the last one the run itself inserted, the deletion does not start a step —
it shortens the run. `History.record` offers the edit to `coalesceRun` when the kinds
match and to `trimRun` when the step was typing and this one is a deletion, and it
**drops** a step a trim leaves empty (`inserted === '' && removed === ''`): the burst
changed nothing, so undo goes to the edit before it.

The design decision worth recording, because a reader will wonder: a run deleted *whole*
leaves no step rather than an empty one that would put the typed word back on the next
undo. Type "hello", delete it, and undo takes what came before the burst; you do not walk
back through a word you already decided not to write. Everything else is unchanged: a
Backspace that reaches past the run into the document's own text (including the one that
follows a run already trimmed away), Delete, a paste, and a caret that moved are steps of
their own. A run that had *replaced* text keeps its `removed` when it is trimmed away —
that deletion is what the author ended up making. And a trim does not close the run:
"hel", Backspace, "l" is one step again, because a merged step keeps the kind it was in.

### The mark an edit remembers

`DocumentEdit.caretBefore`/`caretAfter` are gone; an edit carries `before?: EditMark` and
`after?: EditMark`, and a mark is a range whose ends meet for a caret. That one change
made the algebra simpler rather than more complex: `invert` is a swap (`caretsOf` became
`marksOf` and lost its two branches), a selection survives the swap, and coalescing
composes marks the same way it composes text.

`editing/context.ts: authorMark` says where the author was — the live selection through
`rangeOffsets`, the same mapping the commands edit with, so what an edit remembers and
what it replaces cannot disagree — and `applyEdit` records it with the caret it leaves
behind. `markdown_editor.ts: applyHistory` restores `edit.after` through
`context.ts: restoreMark`: a caret for a collapsed mark, and for a selection the range
placement `restoreSelection`. **That function was a duplicate**: `formatting.ts` had the
identical private copy (`domPositionAtOffset` both ends, `setSelectionRange`,
`scheduleCaret` at the end, `scheduleNativeSelection`); the two are now one function in
`context.ts`, called by the formatting command and by the undo.

### Evidence

- `npx tsc --noEmit` — clean; `npm run check` — 20/20 (two new cases in
  `check-history.mjs` beyond the existing ones: the trim rules, and the marks through
  `invert`, a run, and the state).
- Fresh `npm run tauri dev`, `npm run probe:all` — **72/72 probes, 6 skipped** (the two
  new ones included).
- `undo-run-taken-back.js`: type "alpha", Backspace twice, **one** undo takes the three
  letters that survived; type "beta" after an Enter and delete all four, and one undo
  takes the *line break*, which is the observable that separates "no step" from "an empty
  step"; Delete after typing is a step of its own; a letter typed after a trim joins the
  same step.
- `undo-selection-return.js`: select "world", type "there", undo → the document is
  `hello world\n` **and the word is selected again**; undoing a Backspace leaves a
  *collapsed* selection; and a selection spanning two blocks comes back spanning them
  (`anchor` "alpha" at 2, `focus` "beta" at 2), which is the case a single-offset caret
  could never have restored.
- The neighbouring undo probes (`undo-typing`, `undo-after-scroll`, `regression-undo`,
  `paste-blocks`) and the formatting and revealable-source ones were run by name as well
  as in the suite.

### What is left

- `docs/roadmap.md`'s open list is down to P10's **punctuation and digits** in the
  plain-edit rule.
- The boundary this phase keeps: the two whole-document commands (`state.ts: setText` —
  inline formatting, and find and replace all) record no marks, so undoing one still
  leaves the caret where it is rather than restoring the selection it covered. Giving
  them marks is a small change with its own probes (formatting knows both ranges; the
  find bar's replace-all does not obviously have one to restore), and it was not this
  phase's job.
