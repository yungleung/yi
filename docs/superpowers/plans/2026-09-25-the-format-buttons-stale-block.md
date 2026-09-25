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
- [ ] Task 2: `format-buttons.js` is the probe this fix owes — it fails before and must
      pass after. Watch it fail on the branch's first commit.
- [ ] Task 3: the fix in `editing/formatting.ts`.
- [ ] Task 4: acceptance and docs — `npx tsc --noEmit`, `npm run check`, a fresh
      `npm run tauri dev`, `npm run probe:all`; `docs/architecture.md` (the index's
      consequence for a command), `docs/roadmap.md` (the entry moves from *Open* to
      *Closed*), then ask the user about merging.

## Handoff

To be written when the fix is in.
