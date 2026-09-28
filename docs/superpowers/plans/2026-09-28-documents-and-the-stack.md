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

**Approved and clarified (2026-09-28).** The user confirmed the ask rule and added the one
thing that keeps it honest: *"when the current document is stacked, and then we click to open a
new file, if there are inconsistency or new edits between the current document and its stacked
document, there is no need to ask, we should update the stacked document to its latest
version."* That is the model below: **pushing stores no copy** — the stack holds the document
itself, one of which may be the current one, so a stacked document is always its own latest
version. What makes that true is capturing the live document's text and view **when the reader
switches away from it**, which is Task 3's `captureView` and Task 4's wiring. And the startup
document stays out of the ask, since the production build will open a path rather than the demo
document.

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
| A document | `src/services/document_session.ts` | `{ id, path \| null, title, content, saved, stacked, view: { caret, scroll } }` — the file it came from, the text as it stands (edits included), the text as it was last read or written (`saved`, which is what "editing" means), and where the reader was |
| The session | the same module | `{ version, current: id, documents: [...] }`, with the events `DOCUMENT_SESSION_CHANGED`; the *current* document may or may not be in the stack |
| The document's id | `src/services/document_manager.ts` | the frontmatter `id` (`readFrontmatterId`, already there for *Copy id*), else the first fourteen digits anywhere in the document — the id is a `YYYYMMDDHHMMSS` stamp — else the path, else a key the session makes for a document that has none. A later change will generate the id for a new file; this one only reads it |
| The title | the same module | the frontmatter `title`, else the first heading, else the file name, else `Untitled` — read from the document's own content, so a document that has never been on disk still has a name |
| The view state | `editor_panel.ts` → `markdown_editor.ts` | `captureView()` / `restoreView(state)` — the only way the session can learn or set the caret and the scroll, because only the editor owns the DOM |
| Reading a file | `tree.ts` (unchanged) | it reads the file and emits `DOCUMENT_OPENED` with `{ path, content }`; the session decides what that means |
| Persistence | `src-tauri/src/session.rs` behind `src/api/session.ts` | `load_session` / `save_session`, a JSON file in the app data dir |

**Why the session is not in `config.json`.** The config is preferences (workspace, bibliography,
layout); a session is work in progress — several documents with their text — and it wants its
own file and its own `version` field so a future change can migrate or discard it.

## The behaviour

1. **Push** (the titlebar toggle, `session:toggleStack`): the current document joins the stack
   (`stacked = true`) and stays on screen; a second press takes it out again. The status
   component turns from "not stacked" to "in the stack".
2. **Open a file**: if the current document is stacked, it is replaced in the foreground
   without a word — its latest version is in the stack, which is the point of pushing it. If it
   is not stacked, the app asks (`ask`, the native dialog the tree already uses for delete):
   *push it and open* — or *open anyway*, which is today's behaviour, the current document
   gone. Two cases never ask: a document that is already stacked, and the document the app
   started on when it has neither a path nor an edit (nothing would be lost).
3. **Open a file that is already in the stack** brings *that* document forward, with its edits
   and its view, rather than reading the file again — the stack's whole point is that the
   in-memory copy is the newer one.
4. **Restore** (the stack popover): `current = id`, and the editor is given the document's
   content, caret and scroll.
5. **Drop** a document from the stack: the popover's × at the rightmost edge of a row, which
   asks about saving first when the document is not the current one and is not saved.
6. **Restart**: the session file is read; the current document is restored with its caret and
   scroll, and the stack is intact. Nothing is re-read from disk on the way (see decision 1).
7. **Saved or editing.** Because the session's copy is the truth, the document can differ from
   its file, so the status bar says which it is: **`Saved`** when the text is what was last
   read from or written to disk, **`Editing`** when it is not. "Editing" has to be a state the
   author can leave, and today there is no way to: `⌘S` emits `save` and nothing listens, so
   only *Save As* writes anything. **This plan therefore adds a real Save** (`file:save`:
   write the document's text to its own path, or fall back to the Save As dialog when it has
   none) — the indicator is meaningless without it.

## The interface

- **Two titlebar buttons**, in the titlebar's right group, with the user's glyphs:
  - **The stack toggle** (`session:toggleStack`) draws `stack-push` while the current document
    is *not* stacked and `stack-pop` while it is, exactly as the layout button draws the layout
    in hand: one press pushes the document into the stack, a second takes it out. It carries
    `aria-pressed` and a tooltip naming what the press does.
  - **Open the stack** (`session:openStack`) draws the layered `stack` glyph.
  Both follow `docs/adding-a-command.md` — one id, one home, one way in — as `view:togglePage`
  did.
- **The stack popover** takes the shape of `table_picker.ts` (absolute, `top-full`, `z-50`,
  closes on Escape, on a click outside, and after a pick): one row per stacked document showing
  its **title** (`src/services/document_manager.ts`), with the row's click restoring it. The
  row is justified — the title on the left, a small **×** at the rightmost edge — and the × on
  a document that is **not the current one and not saved** asks first whether to save it (its
  path if it has one, Save As if it has not); the current document's row is marked.
- **The status components**, in the status bar (`status_bar.ts`) beside the word count and the
  layout button: the **saved state** of the current document (`Saved` / `Editing`, the
  user's own words) and the **stack state** (`In the stack` / `Not stacked`, with the size of
  the stack shown as `3 stacked`).
- **The `⋯` button goes.** `main.ts` builds a `titleActions` button that nothing listens to —
  the user asked for it to be removed, and the two new buttons take its place in the group.

### The glyphs the user sent

```html
<!-- stack-push: the toggle while the document is not stacked -->
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16">
  <path d="M0 0h16v16H0z" fill="none" />
  <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">
    <path d="m3.25 7.25-1.5.75 6.25 3.25 6.25-3.25-1.5-.75m-11 3.75 6.25 3.25 6.25-3.25" />
    <path d="m8 8.25v-6.5m-2.25 4.5 2.25 2 2.25-2" />
  </g>
</svg>

<!-- stack-pop: and while it is stacked -->
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16">
  <path d="M0 0h16v16H0z" fill="none" />
  <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">
    <path d="m4.25 6.75-2.5 1.25 6.25 3.25 6.25-3.25-2.5-1.25m-10 4.25 6.25 3.25 6.25-3.25" />
    <path d="m8 8.25v-6.5m-2.25 2 2.25-2 2.25 2" />
  </g>
</svg>

<!-- stack: the button that opens the stack -->
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 56 56">
  <path d="M0 0h56v56H0z" fill="none" />
  <path fill="currentColor" d="M28.012 31.68c.937 0 1.851-.305 2.976-.961l18.352-10.64c1.875-1.102 2.625-1.97 2.625-3.259c0-1.265-.75-2.133-2.625-3.234L30.988 2.946c-1.125-.657-2.039-.962-2.976-.962c-.961 0-1.852.305-2.977.961L6.684 13.585c-1.875 1.102-2.625 1.97-2.625 3.235c0 1.29.75 2.157 2.625 3.258l18.351 10.64c1.125.657 2.016.962 2.977.962m0-4.078c-.329 0-.657-.118-1.032-.329L9.121 17.055c-.094-.047-.164-.117-.164-.235c0-.093.07-.164.164-.21l17.86-10.22c.374-.21.702-.327 1.03-.327s.657.117 1.032.328l17.836 10.218c.117.047.188.118.188.211c0 .117-.071.188-.188.235L29.043 27.273c-.375.211-.703.329-1.031.329m0 15.632c.843 0 1.57-.398 2.554-.984L50.7 30.367c.89-.539 1.266-1.312 1.266-2.039c0-.96-.703-1.758-1.336-2.062L28.902 38.805c-.328.187-.633.328-.89.328c-.258 0-.563-.14-.891-.328L5.394 26.265c-.656.305-1.359 1.102-1.359 2.063c0 .727.422 1.524 1.29 2.04L25.456 42.25c.984.586 1.687.984 2.555.984m0 10.782c.843 0 1.57-.399 2.554-.985L50.7 41.148c.867-.492 1.266-1.312 1.266-2.039c0-.96-.703-1.734-1.336-2.062L28.902 49.609c-.328.188-.633.328-.89.328c-.258 0-.563-.14-.891-.328L5.394 37.047c-.656.328-1.359 1.101-1.359 2.062c0 .727.422 1.547 1.29 2.04L25.456 53.03c.984.586 1.687.985 2.555.985" />
</svg>
```

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
2. **The ask is `ui/prompt.ts`: one utility, two hands, chosen from the page.** It began as the
   native `ask` the tree's delete uses, and a probe cannot press one: the harness reaches the app
   through the webview, and a native modal blocks the webview until a person answers (measured:
   two probes hung for their whole budget on one, and the app had to be restarted). The first fix
   was a card in the page; the user then asked for the two to be one abstraction — and a *general*
   one, since asking is not a session's business — so `Prompt` shows a reader the system dialog
   and a probe the card, deciding by what is in the page (the harness installs `window.__t`, and
   only the harness does), with the same words either way. The session takes it as a port; the
   workspace tree's delete asks it directly, so that question is testable for the first time —
   `tree-file-actions.js` drives both answers. Neither hand takes focus, because a caller may be
   asking in the middle of an editing gesture whose caret has to survive it.
3. **Pushing does not clear the screen**: the document stays where it is and is simply also in
   the stack. That is what the status component reports.
4. **The id, not the path, is a document's identity** (the user's rule): a document is keyed by
   the frontmatter id, else the first fourteen digits in its text, and only falls back to the
   path when it has neither — so the stack cannot hold the same document twice, and two files
   that share an id are the same document to it, which is what those ids are for.
5. **Popping a document out of the stack keeps it on screen** — the toggle takes it out of the
   stack; it does not close it. Closing the current document is not something the brief asks
   for, and today there is no way back to a closed one.

## Tasks

- [ ] Task 1: the model, in Node — `src/services/document_session.ts` (pure: push, open with
      the ask rule, restore, drop, the id rule) and `test/checks/check-document-session.mjs`,
      including the JSON round-trip and a version this build does not know (discard, do not
      throw).
- [ ] Task 2: the file, on the Rust side — `session.rs` (`load_session`, `save_session`),
      `src/api/session.ts`, registered in `lib.rs`, with `cargo test` for the path and the
      round-trip.
- [ ] Task 3: the editor as a view — `captureView`/`restoreView` on the editor panel, and
      `scrollAnchor`/`scrollToAnchor` on the renderer (Task 4's probe measures the drift).
- [ ] Task 4: the wiring — the tree emits `{ path, content }`; the session owns the open path;
      `main.ts` loads the session on start and saves it (debounced) on change.
- [ ] Task 5: **Save** — `file:save` (write to the document's own path, else the Save As
      dialog), the `save` menu event wired to it at last, and the `saved` text the indicator
      and the × prompt both read.
- [ ] Task 6: the interface — `src/ui/toolbar/session_toolbar.ts` (the stack toggle with the
      user's `stack-push`/`stack-pop` and *open the stack*), the popover
      (`src/ui/session/stack_popover.ts`), the two status components
      (`src/ui/document_status.ts`), mounted in the titlebar and the status bar; and the `⋯`
      button removed.
- [ ] Task 7: the probes — `document-stack.js` (push → open a file → the stack button restores
      it with its caret and scroll; the ask rule with the dialog stubbed, the way
      `footnote-preview.js` stands in for the opener; the × prompt on an unsaved document) and
      `document-session-restart.js` (the session file written, the page reloaded, the document,
      caret and scroll back).
- [ ] Task 8: acceptance and docs — `npx tsc --noEmit`, `npm run check`, `cargo test`, a fresh
      `npm run tauri dev`, `npm run probe:all`; `docs/architecture.md`, `docs/ai-context.md`,
      `docs/roadmap.md`, `test/README.md`, and this plan's handoff.

## Handoff

**Waiting on the user's review — nothing is merged.** `codex/document-session` holds this plan,
the model with its check, the session file, the save command, the wiring and the interface, each
as its own commit.

**What was built.** `services/document_session.ts` is the model — pure, over a plain object, and
`test/checks/check-document-session.mjs` holds it (30 checks: the id and title rules, opening
with and without the question, pushing, dropping, restoring, capturing, and what a session file
is allowed to say). `services/session.ts` is the living session: it holds the editor and the
question and the disk, so it is the one place that knows what a click in the tree means.
`session.rs` (with `src/api/session.ts`) is the file, written atomically — a temporary file and a
rename, because a session is work in progress. `markdown_editor.ts` gained `captureView` /
`restoreView` and `virtual_block_renderer.ts` gained `scrollAnchor` / `scrollToAnchor`, with the
content top a page needs. `session_commands.ts` registers `file:save`, `file:saveAs` and the
stack's commands; `ui/toolbar/session_toolbar.ts` draws the user's `stack-push`/`stack-pop`
toggle and their layered `stack` glyph; `ui/session/stack_popover.ts` is the list; `ui/
document_status.ts` is the two status pieces; and `ui/session/session_prompt.ts` is the card.
The dead `⋯` button is gone. The question is asked by `ui/prompt.ts` — the app's own utility, not
the session's: the system dialog for a reader, a card in the page for a probe, chosen by whether
the harness's `__t` is on the window (`test/probes/lib.js` is the only thing that puts it there),
with the same words either way. The session takes it as a port (`attachPrompter`); the workspace
tree's delete asks the singleton directly, which is what made that question testable.

**Six things the work taught, and where they are written down.** (1) **A document's id is read
at the top of it.** The user's rule — frontmatter `id`, else the first fourteen digits — read
*anywhere* gave the two fixture documents the *same* id, because one lists a note's id in a
table and the other links to it: the session then took the second for the one already open.
`document_identity.ts` reads the opening paragraph only. (2) **A pathless document's key carries
the run's stamp**, or a new one collides with one the file restored. (3) **Only the stack and
the document on screen are kept** (`reachable`): anything else is unreachable, and it grew the
session file with every file opened and left. (4) **A capture that cannot see the caret keeps
the one it had** — a reader who scrolled away from their caret before leaving was otherwise put
back at the beginning. (5) **A block's offset is not the scroller's**: on a page there are 118px
of desk and margin above the prose, which `contentTop()` adds everywhere a scroll position is
read or written (the footnote jump had been landing 118px out because of it). (6) **Restoring
the view waits two frames**, like `keepScroll`: placing the caret makes the browser scroll it
into view, and that scroll arrives after the one the restore sets.

**What the view restore can promise, measured.** The caret is exact (a document offset). The
view comes back to the right *block* and lands within about a hundred pixels on the demo
document — the blocks above the view are *estimated* until they are laid out, and the estimate
is a line of body text each, whatever the block is, so the headings above the view are twenty to
thirty pixels short each. `scrollToAnchor` sets the scroll twice (the first pass mounts the
blocks around the anchor so the second can use their real heights), and the probe holds it to
within a screen rather than pretending it is exact.

**Two things for whoever comes next.** A probe that answers *save* to the question writes a real
file — one of mine wrote into `test/fixtures/workspace/default-document.md` and it had to be
restored from git — so the probes here answer "no", and the ones that drive the tree should run
in a workspace of their own (`t.openWorkspace`, as `tree-file-actions.js` does). And a document
with no id of its own, when it is saved for the first time, is not yet given a `YYYYMMDDHHMMSS`
id: the user said that generator comes later.

**Acceptance.** `npx tsc --noEmit` clean; `npm run check` **28/28**; `cargo test` **12/12**
(three of them the session file's); a fresh `npm run tauri dev`; and `npm run probe:all`
**95/98 (15 skipped)** — `insert-rule.js` (the long-standing one), `edit-cost.js` (over the 5 s
budget at this window size, as recorded) and `edit-stability.js` (whose settling guard passes on
its own). The four new probes pass by name: `document-stack` (4 checks), `document-stack-restore`
(3), `document-stack-ask` (4) and `document-session-restart` (2).
