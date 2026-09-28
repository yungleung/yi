# New Markdown

**Goal:** the user's ask — *"When it is clicked, it would show a dialog asking the user choose the
target folder in the workspace, and give a change to name the file. The default file name is the
generated id (14 digits as we mentioned). The new file has a default frontmatter, including title
(with default value 'Untitle' and it will be selected by default, with the caret right at the end
of string, so user can delete the whole word and give a new title), date (YYYY-MM-DD), id (the
generated as the default optional file name) and keywords with a default value 'untagged'. The new
file operation in the tree should also follow the same pattern. The user can customize the default
frontmatter, but the default keys are required."*

**Spec:** the user's message; the branch is `codex/new-markdown` and the user reviews this plan
before it is implemented.

## What is already there, and what is missing

- **The menu item exists and does nothing.** `src-tauri/src/menu.rs` builds *File → New Markdown*
  with `CmdOrCtrl+N`; the handler has no arm for `new_markdown` and no module in `src/` listens for
  it. (The same shape `save` had until last week.)
- **The tree's *New file*** (`tree_ops.ts: createAndRename`) creates an **empty** `Untitled.md`,
  reloads the tree and opens the row's name for editing. Nothing writes a frontmatter.
- **The id rule is read-only so far.** `services/document_identity.ts` reads an id (frontmatter
  `id`, else the first fourteen digits at the top of the document, else the path); the user's
  "later we will write a function to generate one" is this work.
- **The settings window** (`src/ui/settings/citation_settings.ts`) is a small config-backed form —
  the place a default-frontmatter template belongs.
- **The prompt utility** (`src/ui/prompt.ts`) asks yes/no; a *form* is a new shape, and a new
  component.

## The design

### 1. The rule, in one home (`src/services/new_document.ts`, pure)

| Rule | What it says |
| --- | --- |
| `newDocumentId(when)` | `YYYYMMDDHHMMSS` in **local** time — the fourteen digits the readers already recognise |
| `newDocumentText({ id, date, title, keywords, template })` | the whole document: the user's template with the **required keys** filled in — `title` (`Untitle`), `date` (`YYYY-MM-DD`), `id`, `keywords` (`untagged`) — in that order, inside a `---` block, with a blank line after it |
| `requiredKeys` | `title`, `date`, `id`, `keywords`: a template missing one gets it added; a template that has them keeps its own values and its own extra keys |
| `titleRange(text)` | where the **title's value** is, so the editor can select it |

A template that names a key twice, or writes a value the parser cannot read back, is the author's
own; the app only guarantees the four keys are *present* and readable.

### 2. The dialog (`src/ui/new_document/`, a card like the prompt)

One card, in the page, for readers and probes alike — there is no system dialog that means "a
folder **in the workspace** and a name", so this one has no native twin:

- **the folder**, as the workspace's folders in a list, indented like the tree, with the folder of
  the document on screen preselected (the workspace root when there is none);
- **the name**, a text field, defaulting to the generated id and without its extension in the
  field (`.md` is added);
- **Create** and **Cancel**; Escape cancels; neither button takes the focus away from the field.

A probe drives it the way it drives the prompt: real buttons, a real input, `data-new-document-*`
attributes.

### 3. What Create does (`file:newMarkdown`, the command the menu item names)

1. Read the workspace's folders (this is why the dialog is in the app: `list_folder_files` already
   answers, and the tree already knows the open folders);
2. ask the dialog;
3. `createEntry(folder, name, true)` and write `newDocumentText(...)` into it — two steps, so a
   failure to write leaves an empty file rather than nothing, and the toast says so;
4. reload the tree (the row appears) and **open the new document**, with the title's value
   selected and the caret at its end.

### 4. The tree's New file follows it

The tree's own action creates `⟨id⟩.md` with the same frontmatter and opens it the same way — the
folder is the row that was clicked, so there is nothing to choose; the *file's* name is the id,
and the tree's rename action is how a reader changes it if they want to.

### 5. Customising the default frontmatter

`new_file_frontmatter` joins the app config (a string, serde-defaulted to the built-in template),
and the settings window gains a textarea for it beside the bibliography — saved through
`configManager.update` like the rest.

### 6. Selecting the title when the document opens

`DocumentView` — the session's record of where the reader is — gains `to: number | null` beside
`caret`: a selection is a range, and the user asked for one. `markdown_editor.ts: restoreView`
places it with the `setSelectionRange` it already imports, and the model's check gains the range.

## Tasks

- [ ] Task 1: the rule and its check — `services/new_document.ts` and
      `test/checks/check-new-document.mjs`: the id's shape and its local-time reading, the
      frontmatter for a template with all four keys, one missing each key in turn, extra keys kept,
      and the title's range reading back as `Untitle`.
- [ ] Task 2: the view's range — `DocumentView.to`, `restoreView`, and the model check.
- [ ] Task 3: the dialog — `src/ui/new_document/` (the card, the folder list, the name field).
- [ ] Task 4: the command — `file:newMarkdown` in the registry and `session_commands.ts` (or a
      module of its own if the session is not the right owner — it creates *documents*, which is
      the session's business), the Rust arm that emits `new_markdown`, and the mapping in
      `commands/menu.ts`.
- [ ] Task 5: the tree — its New file creates the id-named file with the frontmatter and opens it.
- [ ] Task 6: the setting — `new_file_frontmatter` in the config and the settings window's field.
- [ ] Task 7: the probes — `new-markdown.js` (in a workspace of its own under `/private/tmp`: the
      menu's command opens the dialog, Create writes the file with the frontmatter, the new
      document is on screen with the title selected, and a keystroke replaces `Untitle`) and the
      tree's own path the same way.
- [ ] Task 8: acceptance and docs — `npx tsc --noEmit`, `npm run check`, `cargo test`, a fresh
      `npm run tauri dev`, `npm run probe:all`, and `docs/architecture.md`,
      `docs/ai-context.md`, `docs/roadmap.md`, `test/README.md`.

## Decisions I have made, and what I would change

1. **The dialog is a card in the page, not a system dialog** — the workspace's folders and a name
   are not something a system file picker means, and a card is what a probe can drive. (The
   prompt's `ui/prompt.ts` keeps the two-handed shape for yes/no questions; this is its own
   component because its shape is different.)
2. **The id is local time**, not UTC: it is the author's stamp on their own note, and the ids
   already in the fixtures read as local stamps.
3. **The default title is `Untitle`** — the user's own spelling, twice. If it was meant to be
   `Untitled`, that is one word in one constant.
4. **The tree no longer begins an inline rename for a new file**: the file is already named by its
   id and the title is what the reader is asked to type; renaming the *file* stays available as
   the tree's own action. The alternative is to keep the inline rename and skip opening the
   document, which would lose the "select the title" half of the ask.
5. **A template is a template, not a schema**: the app adds the four required keys when they are
   missing and keeps everything else exactly as the author wrote it.

## Handoff

Landed on `codex/new-markdown`. Everything in the plan's *Tasks* is done, with three
decisions taken on the way and one finding worth carrying forward.

**Where each rule lives.** `src/services/new_document.ts` is the whole of a new note as pure
functions: `newDocumentId`/`newDocumentDate` (local time), `newDocumentText` (the template with
the four required keys guaranteed), `titleRange` (the title's value, quotes excluded) and
`DEFAULT_TEMPLATE`. `src/services/workspace_folders.ts` is the one walk of the workspace that
the card's list of places needs (and `parentFolder`, which the tree's own operations now share
rather than keeping a second copy). `src/ui/new_document/new_document_dialog.ts` is the card;
`src/ui/new_document/new_document_flow.ts` is the command `file:newMarkdown` and the four things
it does in order. The tree's *New file* is a *trigger*: `tree_ops.ts: runTreeAction` runs the
command with the row's folder as its payload, the way the table menu runs a table command, so
the two ways of making a note cannot drift apart.

**What was decided beyond the plan.** (1) A template's `id:` and `date:` values are *stamped
over* — a note is made once, and the app is the one that knows when — while `title`, `keywords`,
extra keys and comments are the reader's exactly as written; the required keys a template leaves
out are appended in the ask's order. (2) A note whose generated name is already taken (two notes
inside one second) is retried at the *next second*, so its file name and its frontmatter id stay
the same fourteen digits, and a name the reader typed is never changed under them. (3) The tree's
inline rename for a new file is gone; the file is named by its id and the *title* is what the
editor selects, which is the half of the ask an inline rename could not serve.

**The finding.** The webview's file plugin is scoped to `$HOME/**`
(`src-tauri/capabilities/default.json`), while the app's own Rust file commands carry no scope, so
a workspace outside the home directory can be listed and rearranged but not *read* or *written*
from the page. Measured: `plugin:fs|read_text_file` on `/private/tmp/…` answers *forbidden path*.
The new-note write goes through that plugin (as the session's *Save* already did), which is why
both probes make their workspace in the home directory — and why this is now the first item under
*Open* in `docs/roadmap.md`.

**What proves it.** `test/checks/check-new-document.mjs` (the rule, in Node), and two probes in
the running app: `test/probes/new-markdown.js` (the event the native menu sends — not the command
run directly — opens the card, the card's
defaults, the file written where it was asked for, the note on screen with its title selected and
a keystroke replacing it, and the tree's own trigger) and `test/probes/new-note-template.js` (a
template written through the app's config, the settings tab that reads it, and the note that comes
out). `test/probes/tree-create.js` was rewritten: the tree's new file is id-named, carries the
frontmatter, and is *not* left in an inline rename. `DocumentView.to` is checked in
`check-document-session.mjs`, and `test/probes/lib.js`'s `openWorkspace` now reloads the app's own
config manager, so a probe that points the app at a folder sees it the way the app does.

## Reviewed, and changed

Three things the review asked for, all on the same branch:

1. **The question has two hands, as the prompt's does.** A reader is asked by the system's own
   sheet (`save` — one native surface that means "where, and what is it called"), a probe by the
   card. The switch is one module, `src/ui/under_test.ts`, which `ui/prompt.ts` now reads too
   instead of keeping its own copy of the test. The sheet's answer is a single path, and the rule
   that reads a folder and a name out of it is pure — `services/workspace_folders.ts:
   placementOfPath`, checked in `test/checks/check-workspace-folders.mjs` — **because a native
   sheet cannot be probed *or* stood in for**: measured three ways (a `fetch` stand-in that works
   for an app command and for the opener never sees `plugin:dialog|save`; the real sheet then
   blocks the harness for its whole budget), so the card is the only hand a probe can drive, and
   the promise this plan made about driving "the real UI" holds for the card alone. The failed
   attempts opened real sheets on the maintainer's screen; that is written down in
   `test/README.md` so nobody repeats it.
2. **`keywords` is a list.** The built-in frontmatter writes `keywords:` with `  - untagged` under
   it; the rule learned the one thing it needed — a value written on the lines *below* a key is
   that key's value, so the reader's own list is left alone while a key with nothing under it is
   still filled in.
3. **The stored template may be absent.** `new_file_frontmatter` is a string or nothing, and
   nothing means the app's own. Before this the app wrote its default into every config that saved
   anything else — which is how the old `keywords: untagged` had frozen itself into the running
   app's config — so a config that still holds the built-in the app shipped before the change
   reads as no template (`src-tauri/src/settings.rs: as_read`, with a Rust test).

And one more the review asked for, in the settings window: its sidebar is now a strip of tabs —
144 px instead of 224, each the sidebar's own width, square and flush against the next, with the
active one in the theme's active colour.
