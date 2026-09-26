# The Format Buttons and a Block From Before the Edit

**Goal:** pressing a formatting button writes the markers into the text *and* shows them.
Today the text gets them and the rendering does not, until something else re-renders the
block.

**Spec:** the user's review of the link work — *"then create a branch to fix the format
bug"* — over the two probes the strict harness had been hiding
(`docs/roadmap.md`, *Open*, its first entry).

## Part 1 — what the app does, measured

`test/probes/format-buttons.js` presses each of the four buttons over a selection of
`Alpha` in `Alpha beta.` and checks the raw document *and* the rendered element:

| | |
| --- | --- |
| raw after Bold | `**Alpha** beta.` ✅ |
| rendered `<strong>` | **null** ❌ (the paragraph still shows the plain `Alpha beta.`) |
| what a probe's error log says | `Error: this block is not in the index` |

The stack, captured off the app (`window.onerror`, `/private/tmp/yi-measure/format-stack.js`):

```
positionOf@block_index.ts:111
lineOf@block_index.ts:98
applyFormatting@editing/formatting.ts:66
runCommand@commands/registry.ts
formatting_toolbar.ts:35
```

Line 66 of `editing/formatting.ts` is
`const sameBlock = start.block.lineStart === end.block.lineStart;` — and `start`/`end`
were read from `documentOffsetAt` **before** `context.state.setText(edit.text, …)`.
A block's four positions are *derived*: a block object holds its kind and its text, and
`charStart`/`lineStart` come from the document's index (`document/blocks.ts` over
`document/block_index.ts`). The whole-document edit re-splits the blocks, so the block
object the command is holding is one the index no longer holds — and by design it answers
`this block is not in the index` rather than a position that belongs to another block.
The command therefore throws *after* the text edit and *before* anything is rendered: the
raw text changes, the view does not.

Two things the measurements say about how old this is: the same checks fail at
`d4a26cf` (before both phases that came before this one), and the failure was invisible
because the probe harness never read a probe's own `failed` list (fixed on the link
branch, `test/tauri-probe.mjs: failedChecks`).

## Part 2 — the fix

One rule, applied where it was broken: **a command may not ask a block from before an
edit where it sits.** The two line numbers the caller needs — is the formatted range in
one block, and which blocks the failed patch has to re-render — are read from the state
*after* the edit, by offset (`state.getBlockAtOffset(edit.wrapFrom / edit.wrapTo)`), which
is the same thing `format_dom.ts: patchFormatDom` already does on its first line.
`editing/formatting.ts` is the only place in the tree that held a block across an edit.

No behaviour changes besides the bug: the same block is patched in place when the patch
can represent it, and the same block (or blocks) is rendered again when it cannot.

## Part 3 — tasks

- [x] Task 1: measure it (Part 1), including the stack and the check against an older
      commit.
- [x] Task 2: `format-buttons.js` is the probe this fix owes — it fails before and must
      pass after. Watch it fail on the branch's first commit.
- [x] Task 3: the fix in `editing/formatting.ts`.
- [x] Task 4: acceptance and docs — `npx tsc --noEmit`, `npm run check`, a fresh
      `npm run tauri dev`, `npm run probe:all`; `docs/architecture.md` (the index's
      consequence for a command), `docs/roadmap.md` (the entry moves from *Open* to
      *Closed*), then ask the user about merging.

## Handoff

**Two causes, one behind the other.** The plan's Part 1 named the first: `applyFormatting`
held the blocks `documentOffsetAt` gave it *before* its own whole-document edit, and asked
one of them for `lineStart` afterwards — a position the index no longer holds, since a
block's four positions are derived and the edit re-split the blocks. Answering with an
error rather than with another block's position is the index's design, so the command is
what had to change: it now asks the state by offset after the edit (`getBlockAtOffset`),
the same two offsets `patchFormatDom` reads its own block from.

**The second cause was only reachable once the first was fixed**, and the strict harness
found it immediately: with the throw gone the patch ran for the first time, `format-buttons`
passed — and `undo-selection-return` failed with `wor` of `world` selected after an undo.
The patch writes the block's markup behind the renderer's back, and the renderer remembers
an element by the content it was built from: after a patch that record was the *pre-patch*
content, so the undo (which puts that content back) compared equal and looked like nothing
to re-render, leaving the `<strong>` and its shifted `data-text-from` on screen for the
selection to map through. `virtual_block_renderer.ts: notePatchedBlock` is the patch saying
what it wrote, and `editing/formatting.ts` calls it whenever the patch succeeds.

**The probes.** `format-buttons.js` (each of the four styles: the raw text *and* the
rendered element) is the probe the bug owed; it failed on the plan commit and passes with
the fix. `undo-selection-return.js` is the regression the second cause produced, and it is
green again. Neither was added for this phase: the first was silently failing since the
probe harness stopped ignoring a probe's verdict, and the second was already there.

**Acceptance.** `npx tsc --noEmit` clean, `npm run check` **24/24**, a freshly started
`npm run tauri dev`, `npm run probe:all` **89/90 (8 skipped)** — the one failure left is
`insert-rule.js`'s `atTheEnd`, a separate pre-existing bug the roadmap still lists under
*Open* — plus by hand on that fresh app: `format-buttons`, `undo-selection-return`,
`undo-typing`, `undo-run-taken-back`, `undo-after-scroll`, `plain-edit-parse`,
`plain-edit-offsets`, `plain-edit-markers`, `edit-stability`, `revealable-flows`.

**Still open, and not this branch's.** `insert-rule.js`'s caret at the document end
(`docs/roadmap.md`, *Open*), and the formatting path's height bookkeeping after a patch —
a patch that re-wraps a line changes the block's height and the spacers are not re-measured
(the patch calls `refreshBlockTags`, not `measureEditedBlock`); nobody has reported it and
it was not measured here, so it is written down rather than changed.
