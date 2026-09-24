# Marks for the Whole-Document Commands

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the last item on the roadmap's list. Inline formatting and find-and-replace-all
compute the whole document and record one edit with no marks (`state.ts: setText`), so
undoing one leaves the caret wherever it happens to be instead of putting the author back
where they were — an undo of bold does not give the word back *selected*, and an undo of
"replace all" does not give the match back under the caret.

**Architecture:** the machinery is already there and does not change: an edit carries
marks (`before`/`after`), `applyHistory` restores them, and a non-collapsed mark comes
back as a selection. What is missing is that `setText` cannot take marks at all. It gains
them, and the two commands say what they know: formatting has the selection it replaced
and the span it leaves selected; the find bar has the match it had put the author on.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** the last open item in `docs/roadmap.md`, from P16's handoff
(`docs/superpowers/plans/2026-09-24-undo-marks-and-runs.md`).

## Global Constraints

- A whole-document edit is still *one* edit with its own inverse: the text is the only
  source of truth, and the marks are the same two ranges every other edit carries.
- An edit may carry a mark on one side only: a command that has nowhere particular to
  leave the author records `before` and nothing else, and redo keeps today's behaviour.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` stays green on a
  freshly started app.
- Commit style: `feat(…): …`, `test(…): …`, `docs: …`, and a `merge:` commit.

---

## Part 1 — the design

### 1.1 What each command knows

| Command | Where the author was | Where it leaves them |
| --- | --- | --- |
| Inline formatting (`formatting.ts`) | the selection it formatted, trimmed of surrounding whitespace (`from`, `to`) | the formatted span, which it selects again (`edit.from`, `edit.to`) |
| Find and replace all (`find_controller.ts`) | the active match — the bar has just put the author on it (`revealActive`) | nothing in particular: the matches are recomputed and the old ones are gone |

Both are whole-document replacements, so the `before` mark is in the *old* text's
coordinates — which is exactly what undo restores, so it lands where it says.

### 1.2 The seam

`state.setText(text, marks?)` records the marks with the edit it already records. Nothing
else changes: `applyHistory` restores `edit.after`, `restoreMark` puts a caret or a
selection back, and `invert` swaps the marks — all of it in place since P16.

`formatting.ts` passes both marks; `find_controller.ts` passes `before` alone, which the
history's field comments now allow (an edit may be recorded without an `after` when it
has nowhere particular to leave the author; redo then keeps the caret where it is, which
is today's behaviour and stays).

---

## Part 2 — tasks

### Task 1: the marks

**Files:**
- Modify: `src/ui/markdown/document/state.ts`
- Modify: `src/ui/markdown/document/history.ts`
- Modify: `src/ui/markdown/editing/formatting.ts`
- Modify: `src/ui/markdown/editing/find_controller.ts`
- Modify: `test/checks/check-history.mjs`

**Interfaces:**

- Produces: `state.setText(text, marks?: { before: EditMark; after?: EditMark })`.

- [x] **Step 1: `setText` takes marks**

Record them the way `replaceRange` does, and say in the comment what a whole-document
command can know about its author.

- [x] **Step 2: The two commands**

Formatting: `before` = the selection it formatted, `after` = the span it selects.
Replace-all: `before` = the active match (and no `after`, with a comment saying why).

- [x] **Step 3: The checks**

`check-history.mjs`'s state section: a whole-document edit records the marks it was given
with one text, undoes to the mark it started from, and an edit with only a `before` mark
inverts to one with only an `after`.

```bash
npm run check
```

- [x] **Step 4: Commit**

```bash
git add src/ui/markdown/document/state.ts src/ui/markdown/document/history.ts \
  src/ui/markdown/editing/formatting.ts src/ui/markdown/editing/find_controller.ts \
  test/checks/check-history.mjs
git commit -m "feat(undo): the whole-document commands remember their author"
```

### Task 2: the two commands in the app

**Files:**
- Modify: `test/probes/undo-selection-return.js`
- Add: `test/probes/find-replace.js`
- Modify: `test/README.md` (the count and the new name)

**Interfaces:**

- Produces: the find bar's first probe (replace all, and what undoing it gives back).

- [x] **Step 1: Undo of formatting**

In `undo-selection-return.js`: select a word, click Bold, undo — the document is back and
the word is selected again. It belongs there: the probe is about what an undo gives back.

- [x] **Step 2: The find bar's first probe**

`test/probes/find-replace.js`: open the replace bar (the `replace` menu event), type a
query, type a replacement, click **All**, and assert the document holds the replacement —
then undo, and assert the match the bar had selected is selected again.

```bash
npm run probe -- --fixture default-document.md test/probes/find-replace.js
```

- [x] **Step 3: Commit**

```bash
git add test/probes/undo-selection-return.js test/probes/find-replace.js test/README.md
git commit -m "test(undo): the whole-document commands in the app"
```

### Task 3: Acceptance, docs, handoff

- [x] **Step 1: The docs**

`docs/roadmap.md`: the list closes; what is left is the "measure before deciding" columns.

- [x] **Step 2: Acceptance**

```bash
npx tsc --noEmit
npm run check                                   # 21/21 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 75/75 probes, 6 skipped
```

- [x] **Step 3: The handoff, and the commit**

```bash
git add docs/roadmap.md docs/superpowers/plans/2026-09-25-marks-for-commands.md
git commit -m "docs: close the marks-for-commands handoff"
```

- [x] **Step 4: Merge**

```bash
git checkout main
git merge --no-ff codex/undo-marks-for-commands -m "merge: the whole-document commands remember their author (undo)"
git rev-parse HEAD^{tree} codex/undo-marks-for-commands^{tree}   # must be equal
```

Keep the branch, and report the tree hash.

---

## Handoff — what this phase left

**Undo puts the author back after the two whole-document commands, and the roadmap's open
list is empty.** The machinery was all in place since P16 — an edit carries marks,
`applyHistory` restores them, a non-collapsed mark comes back as a selection — and the only
missing piece was that `state.ts: setText` could not *take* marks at all: the two commands
that compute the whole document recorded one edit with none, so undo left the caret
wherever the reader happened to be.

### What each command records

| Command | `before` | `after` |
| --- | --- | --- |
| Inline formatting | the selection it formatted (trimmed of surrounding whitespace) | the span it selects again, so redo puts the author back in it |
| Find and replace all | the active match the bar had put the author on | none — the matches this edit leaves are recomputed, and none is the one they were on |

The second row is why the history's field comment changed rather than the type: an edit may
carry **one** mark. `invert` already swaps whatever is there, so an undo of a
before-only edit hands that mark back and a redo of it keeps the caret where it is — which
is exactly what replace-all did before, kept deliberately for the half it cannot know.

The two marks for formatting are in different coordinate systems on purpose (the selection
in the text it replaced, the span in the text it produced), which is the same shape every
other edit's marks have.

### Evidence

- `npx tsc --noEmit` clean; `npm run check` **21/21** (the state-level cases in
  `check-history.mjs`: a whole-document edit records the marks it was given, undoes to the
  one it started from, and a before-only edit inverts to an after-only one).
- A freshly started app and `npm run probe:all`: **75/75 probes, 6 skipped**.
- Both probe cases were run against the unmarked callers first, and both fail exactly
  where they should: `find-replace.js` reports
  `and the match the bar was on is selected again — {collapsed: true, text: ""}`, and
  `undo-selection-return.js` reports `and the word it formatted is selected again`.
- `test/probes/find-replace.js` is the find bar's **first** probe: open the replace bar
  through the menu event, type a query and a replacement, click **All**, and check the
  text and then what undo gives back. The bar (`1 of 2` in its status, the first match
  selected) had no coverage before this.

### What is left

`docs/roadmap.md`'s open list is empty — every leftover the phase handoffs named is closed.
What remains is the "measure before deciding" column, none of which frees a keystroke
today: the ordinary path's 9 ms parse, deriving the parse for a plain edit, and the
deferred check's once-a-burst parse. P18's note also stands: the description-list line
reader describes the plugin's shape, and wants a look if the plugin's rule changes.
