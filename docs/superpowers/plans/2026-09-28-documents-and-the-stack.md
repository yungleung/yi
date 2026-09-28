# Documents, and the Stack Behind Them

**Goal:** the user's brief — *"we do not pair a path with the displayed markdown, so restarting
the app will not restore the editor's state: the last open file and the position of the
scrollbar … Also the current design does not allow to open multiple file simultaneously …
We'll allow user to decide if he want to stack a document using a button so that opening a new
file will not override and lose it completely like now, instead it will be pushed to a
background stack, and later when user clicking the file in the stack, the file will be
restored and brought to the foreground again. Also, we could restore this stack when
restarting the app … two buttons in the titlebar and a status component indicating whether it
has been pushed to stack in the statusbar."*

**Spec:** the user's message; the branch is `codex/document-session` and the user reviews this
plan before it is implemented.

## Why this is a refactor, and what is missing

What the code does today, measured by reading it:

- **A document is a string.** `tree.ts: openFile` reads the file and emits `DOCUMENT_OPENED`
  with the *content only*; `editor_panel.ts` hands that to `WysiwygMarkdownEditor.setContent`.
  The path is known to the tree and to nobody else after the click.
- **Nothing survives a restart.** The editor holds one unnamed text; the scroll and the caret
  live in the DOM (`contentView.scrollTop`, the caret's range) and are dropped on reload.
- **Opening destroys.** There is one editor and one text, so a second click in the tree ends
  the first document.
- **The edits are the only copy.** `menu.rs` emits `save` and `save_as`, and only `save_as` has
  a listener (`main.ts`): `⌘S` does nothing at all. So a document lives in memory from the
  moment it is opened, and losing it loses the author's work — which is what makes the stack
  more than a convenience.

## The model

One new home, and the editor stays a view of it.

| Piece | Home | What it is |
| --- | --- | --- |
| A document | `src/services/document_session.ts` | `{ id, path \| null, title, content, stacked, view: { caret, scroll } }` — the file it came from, the text as it stands (edits included), and where the reader was |
| The session | the same module | `{ version, current: id, documents: [...] }`, with the events `DOCUMENT_SESSION_CHANGED`; the *current* document may or may not be in the stack |
| The view state | `editor_panel.ts` → `markdown_editor.ts` | `captureView()` / `restoreView(state)` — the only way the session can learn or set the caret and the scroll, because only the editor owns the DOM |
| Reading a file | `tree.ts` (unchanged) | it reads the file and emits `DOCUMENT_OPENED` with `{ path, content }`; the session decides what that means |
| Persistence | `src-tauri/src/session.rs` behind `src/api/session.ts` | `load_session` / `save_session`, a JSON file in the app data dir |

**Why the session is not in `config.json`.** The config is preferences (workspace, bibliography,
layout); a session is work in progress — several documents with their text — and it wants its
own file and its own `version` field so a future change can migrate or discard it.

## The behaviour

1. **Push** (titlebar button, `session:push`): the current document joins the stack
   (`stacked = true`) and stays on screen. The status component turns from "not stacked" to
   "stacked".
2. **Open a file**: if the current document is stacked, it is replaced in the foreground — it
   is safe in the stack. If it is not, the app asks (`ask`, the native dialog the tree already
   uses for delete): *push it and open* — or *open anyway*, which is today's behaviour, the
   current document gone.
3. **Do not nag about nothing.** The ask is skipped when the current document is the one the
   app opened with and it has neither a path nor an edit — hmm, that rule needs a "has been
   edited" fact, which is `content !== the content it was loaded with`. That comparison is one
   line and it is also what "unsaved" means, so the document carries `loaded: string` for it.
4. **Open a file that is already in the stack** brings *that* document forward, with its edits
   and its view, rather than reading the file again — the stack's whole point is that the
   in-memory copy is the newer one.
5. **Restore** (the stack popover): `current = id`, and the editor is given the document's
   content, caret and scroll.
6. **Drop** a document from the stack: the popover gives each entry a small × (the user's
   brief does not ask for it, but without it a document can never leave the stack).
7. **Restart**: the session file is read; the current document is restored with its caret and
   scroll, and the stack is intact. Nothing is re-read from disk on the way (see decision 1).

## The interface

- **Two titlebar buttons**, in the titlebar's right group: *push* (`session:push`) and *open the
  stack* (`session:openStack`). Both follow `docs/adding-a-command.md` — one id, one home, one
  way in — as `view:togglePage` did. **Icons:** the user has sent theirs for the other buttons;
  until they send two for these, I will draw a tray-with-an-arrow for push and a stack of
  sheets for the popover, and they are one line each to swap.
- **The stack popover** takes the shape of `table_picker.ts` (absolute, `top-full`, `z-50`,
  closes on Escape, on a click outside, and after a pick): one row per stacked document, its
  file name (or `Untitled`), the row's click restores it, its × drops it, and the current
  document's row is marked.
- **The status component** in the status bar (`status_bar.ts`, beside the word count and the
  layout button): `In the stack` / `Not stacked` for the current document, and the size of the
  stack (`2 stacked`) — the first is what the brief asks for, the second is what makes the
  popover's contents legible at a glance.

## Restoring the view under the virtualised renderer

A pixel `scrollTop` cannot be remembered: the renderer mounts a window of blocks and estimates
the rest, so the same pixel means a different place after a rebuild. What is stable is the
**document offset**. So the view state is:

```ts
{ caret: number, scroll: { offset: number, within: number } | null }
```

`offset` is the start of the block at the top of the viewport and `within` how far the view is
scrolled into it. `virtual_block_renderer.ts` gains `scrollAnchor()` and `scrollToAnchor()`
over `BlockSizes.offsetOf` — it already knows a block's pixel offset, and its
`setPageScale` path already tells it when those pixels change.

**What will not be exact.** Between the restore and the moment the blocks around the anchor are
measured, the estimate is a few pixels off per block, so a restored scroll can land a few
pixels away and settle after the first sync. The probe measures that drift and holds it inside
a small bound rather than pretending it is zero; the caret is an offset and is exact.

## Decisions I have made, and what I would change

1. **The session's copy of a document is the truth, and a restart never re-reads the file.**
   Edits are not written anywhere today, so re-reading disk would throw away the author's work
   — the opposite of what this is for.
2. **The ask is the native `ask`**, the dialog the tree's delete already uses. It has Yes/No
   and no Cancel, which is exactly the two outcomes the brief describes.
3. **Pushing does not clear the screen**: the document stays where it is and is simply also in
   the stack. That is what the status component reports.
4. **A document is one per path** (plus one pathless document at a time), so the stack cannot
   hold the same file twice.
5. **`⌘S` still does nothing.** Giving a document a real *Save* (writing to its own path) is a
   gap next door to this work — the session will make it obvious, since a restored document
   with edits no longer has anything on disk to write to. It is **not** in this plan unless the
   user says so; the first task is a refactor, and saving is a behaviour of its own.

## Tasks

- [ ] Task 1: the model, in Node — `src/services/document_session.ts` (pure: push, open with
      the ask rule, restore, drop, one-per-path) and `test/checks/check-document-session.mjs`,
      including the JSON round-trip and a version this build does not know (discard, do not
      throw).
- [ ] Task 2: the file, on the Rust side — `session.rs` (`load_session`, `save_session`),
      `src/api/session.ts`, registered in `lib.rs`, with `cargo test` for the path and the
      round-trip.
- [ ] Task 3: the editor as a view — `captureView`/`restoreView` on the editor panel, and
      `scrollAnchor`/`scrollToAnchor` on the renderer (Task 4's probe measures the drift).
- [ ] Task 4: the wiring — the tree emits `{ path, content }`; the session owns the open path;
      `main.ts` loads the session on start and saves it (debounced) on change.
- [ ] Task 5: the interface — `src/ui/toolbar/session_toolbar.ts` (push, open the stack), the
      popover (`src/ui/session/stack_popover.ts`), the status component
      (`src/ui/stack_status.ts`), mounted in the titlebar and the status bar.
- [ ] Task 6: the probes — `document-stack.js` (push → open a file → the stack button restores
      it with its caret and scroll; the ask rule with the dialog stubbed, the way
      `footnote-preview.js` stands in for the opener) and `document-session-restart.js` (the
      session file written, the page reloaded, the document, caret and scroll back).
- [ ] Task 7: acceptance and docs — `npx tsc --noEmit`, `npm run check`, `cargo test`, a fresh
      `npm run tauri dev`, `npm run probe:all`; `docs/architecture.md`, `docs/ai-context.md`,
      `docs/roadmap.md`, `test/README.md`, and this plan's handoff.

## Handoff

*(written when the work lands)*
