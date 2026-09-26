# Manipulating the Workspace Tree

**Goal:** the tree stops being a viewer. A right-click on a file or a folder opens a menu
that renames, deletes, creates a file or a subfolder under it, reveals it in the system
file manager, or copies its path, its name or its frontmatter id; and entries can be
dragged into another folder to move them.

**Requirements from the user, and how they are met:**

1. *Renaming makes the item content-editable without affecting the tree's layout* — the
   row's own label becomes `contentEditable`, in the same box, and the tree's geometry is
   asserted (the container's `scrollWidth`, every row's rect) before, during and after an
   edit.
2. *The name is selected, without the extension* — entering the edit selects exactly the
   name part of the file name, so typing replaces it and the `.md` stays. (Checked as a
   pure rule: `note.md` → `note`, `a.b.md` → `a.b`, a folder → all of it.)

**Spec:** the user's message. No merge without their word; the branch is
`codex/tree-manipulation`.

## Part 1 — the design

### 1.1 Where the filesystem's rules live

The tree's facts about files are **Rust's**, beside the listing the tree already uses
(`src-tauri/src/files.rs`, `list_folder_files`), with unit tests there: what a name may
be, what already exists, what may not be moved into what. The frontend gets thin wrappers
(`src/api/files.ts`) and reports what the backend says — it does not decide.

| Command | What it does |
| --- | --- |
| `rename_entry(path, name)` | renames in place, keeping the parent; refuses an empty name, a name with a separator, a hidden name (the listing hides dotfiles), and a name already taken; answers the new path |
| `create_entry(parent, name, is_file)` | writes an empty `.md` file or makes a folder; refuses the same names, and appends `.md` when the author left the extension off a file |
| `delete_entry(path)` | removes a file, or a folder and everything under it |
| `move_entry(path, target_dir)` | moves into another folder; refuses a target that is not a directory, the entry itself, anything inside the entry's own subtree, a name already taken there, and a no-op move |

The Rust side stays the authority on the *rules*; the frontend only paints them.

### 1.2 The context menu

The app already has one context menu, for a table cell (`src/ui/table/table_menu.ts`): a
**native** menu built from the frontend through `@tauri-apps/api/menu`, rebuilt for every
right-click so its items are exactly right for what was clicked, popping up at the
pointer, with each item's action running a command. The tree's menu is the same shape —
which also keeps the two menus looking alike, which is the user's complaint whenever they
do not.

Two consequences, both worth stating up front:

- **A native menu cannot be read or driven by a probe** (`docs/testing.md`: nothing can
  select an item of it but a person). So the menu's *contents* are a pure model
  (`src/ui/workspace/tree_menu_model.ts`) with a Node check, and the *actions* behind it
  are commands a probe runs directly — exactly what the table probes do.
- The menu needs the *entry* it was opened on, captured before the menu takes focus.

### 1.3 The pieces

| Piece | Home |
| --- | --- |
| The tree, its rows, its expansion and the wiring of every interaction below | `src/ui/workspace/tree.ts` (moved from `src/ui/workspace_tree.ts`, into a folder like `src/ui/table/`) |
| The menu model: which items an entry offers, in what order, enabled when — pure | `src/ui/workspace/tree_menu_model.ts` |
| The rules that are pure: the name part of a file name, whether a drop is allowed | `src/ui/workspace/tree_rules.ts` |
| The native popup | `src/ui/workspace/tree_menu.ts` |
| The inline rename: entering, selecting, committing, cancelling | `src/ui/workspace/tree_rename.ts` |
| The drag and drop wiring, and its drop hints | `src/ui/workspace/tree_drag.ts` |
| The operations the menu and the drop share: run it, reload the tree, say what happened | `src/ui/workspace/tree_ops.ts` |
| The backend calls | `src/api/files.ts` |

### 1.4 The decisions taken

- **Delete is permanent, behind a confirmation** (the dialog plugin the app already
  ships). Moving to the trash would need a new crate (`trash` is not in the tree) — worth
  asking about, not worth doing unasked.
- **A file is only ever a drop target when it is not one**: entries drop onto folders and
  onto the tree's empty area (the workspace root); dropping onto a file, onto itself, into
  its own subtree, or where the name is taken is refused, with a hint while dragging and
  the backend's reason afterwards.
- **After every operation the tree reloads the affected folders**, keeping which folders
  were open, so a rename or a move does not collapse what the reader was looking at.
- **The app tracks no open-document path** (`save` is Save As through a dialog), so
  renaming or moving the file that is open strands nothing.

## Part 2 — tasks

- [x] Task 1: the filesystem commands and their Rust tests, with the wrappers in
      `src/api/files.ts`.
- [x] Task 2: the pure rules — the menu model, the name selection, the drop rules — with
      Node checks.
- [x] Task 3: the tree in its new folder, with the context menu and its five actions
      (rename, delete, new file, new subfolder, reveal, copy path/name/id).
- [x] Task 4: the inline rename, with the layout assertion the user asked for.
- [x] Task 5: the drag and drop.
- [x] Task 6: the probes (a temporary workspace the probe makes and removes; the inline
      rename's layout and selection; a move and its refusals; the create/delete/copy/
      reveal actions), the docs (`docs/architecture.md`, `docs/ai-context.md`, `test/README.md`,
      `docs/roadmap.md`), and acceptance — `npx tsc --noEmit`, `npm run check`, a fresh
      `npm run tauri dev`, `npm run probe:all`, plus `cargo test` for the new commands.

## Handoff

**What was built, and where.** `src-tauri/src/files.rs` gained four commands with nine Rust
tests: `rename_entry` (refusing an empty name, a path separator, a hidden name, a
non-markdown file, and a name already taken — while still allowing a case-only rename of the
entry itself), `create_entry` (an empty `.md`, or a folder; `.md` appended when the author
left the extension off), `delete_entry` (a file, or a folder and everything under it) and
`move_entry` (refusing a non-folder, a name already there, and anything inside the entry's
own subtree; a no-op where it already lives). `src/api/files.ts` wraps them and the frontend
holds no filesystem rule of its own. `src/ui/workspace/` is the tree: `tree.ts` (rows,
expansion, the wiring, and the host registration), `tree_menu_model.ts` (what a row is
offered — a file, a folder and the workspace itself each have their own list; a folder gets
"New file"/"New folder", a file gets "Copy id", and the workspace is neither renamed nor
deleted), `tree_menu.ts` (the native popup, the table menu's shape), `tree_rules.ts` (the
rename's selection and the drop rules), `tree_rename.ts` (the inline edit),
`tree_drag.ts` (the drag, its target look and its refusals) and `tree_ops.ts` (the actions,
the reload, the toast). `src/ui/workspace_tree.ts` is gone; `editor_panel.ts` and `main.ts`
point at the new home.

**The user's two requirements, as measurements.** The rename happens in the row's own
label with `contenteditable`, and the probe compares the tree's `scrollWidth` and every
row's rectangle before and during the edit: identical. The edit starts with the name part
selected (`note.md` → `note`, `a.b.md` → `a.b`, a folder → all of it), so typing over it
leaves the extension: the probe types through `document.execCommand('insertText')` — a
synthetic key does not insert text into a `contenteditable` at all, which is written down
in `docs/testing.md` now — and reads `renamed.md` back.

**Decisions taken, worth a review.** A new *file* and a new *folder* are both left ready to
be named (one rule, not two), the "new" actions are offered on folders (the user's words)
and not on files, delete is permanent behind a native confirmation (moving to the trash
would need a crate that is not in the tree), and a drop into a folder opens that folder so
the entry is seen to land there.

**What a probe can and cannot hold.** Every action runs through `tree_ops.ts`, which the
probes drive directly — including the delete's `deleteNow`, the half a "yes" leaves, since
the question itself is a native dialog nothing but a person can answer. The menu's contents
are `check-tree-menu.mjs`, the rules are `check-tree-rules.mjs`. The popup and the question
are a person's checks, and the probe headers say so.

**Acceptance.** `cargo test` **9/9** (the filesystem commands), `npx tsc --noEmit` clean,
`npm run check` **26/26**, a freshly started `npm run tauri dev`, and `npm run probe:all`
**88/90 (13 skipped)** — this branch is based on `main`, so the two failures are the
pre-existing `format-buttons.js` (fixed on the unmerged `codex/format-render`) and
`insert-rule.js` — with the five tree probes among the skipped-by-name ones, run by hand
against that same fresh app: `tree-rename` (12 checks), `tree-create` (5),
`tree-file-actions` (5), `tree-delete` (2), `tree-drag` (11). Each of those makes its own
workspace under `/private/tmp` with the app's own commands and removes it again, so the
repository's fixtures are only ever read.

**What is left.** The popup and the delete's question are a person's checks (above). The
format fix from the previous phase is on its own branch, not merged — with it, the suite is
89/90; without it, `format-buttons.js` and `insert-rule.js` fail as `main` does today.

**Round two, on the user's review of the feature.** Three fixes.

*Copy name* copies the name **without the extension** (`note.md` → `note`), which is the
same fact the rename's selection is made of — `nameWithoutExtension` is now the one home for
it in `tree_rules.ts`, and both callers read it. A folder is copied as the name it has.

*The drag did not work in the app*, though the probe's synthetic HTML5 drag events passed.
Measured on the app: the rows did carry `draggable` and WebKit agreed — `-webkit-user-drag`
was `element` on a row — so the markup was right and the webview's own drag machinery was
what never delivered a `drop` to a row. The drag is therefore built from the **pointer's own
events** (`tree_drag.ts`): a press on a row that moves past 4px becomes a drag, the row under
the pointer is the target (`document.elementFromPoint`), the drop rules decide whether it
glows, and letting go moves the entry; the click that follows a drag is swallowed so a drag
never opens the file, `Escape` and a window blur cancel, and the text a press may have begun
to select is cleared. This is also the part a probe can drive — `tree-drag.js` now sends
`mousedown`/`mousemove`/`mouseup` and the move is asserted on disk and in the tree — which
the HTML5 path never was, and that is the lesson worth keeping: a synthetic `dragstart` is a
test of the handler, not of the drag.

*The editable name* keeps square corners (the `rounded-sm` came off the editing classes; the
probe asserts the computed `border-radius` is `0px` while the edit is open).

**Round three: the tree updates what changed, and nothing else.** Every action used to
rebuild the tree from the root — `setWorkspace`, which replaces every row and re-expands
what was open, a visible flash of the whole sidebar. Now the host offers
`refreshFolders(paths)` instead of `reload()`: a change re-reads the one or two folders it
touched (`parentOf(moved)`, the drop's target, and for a rename the folder an open folder
was renamed into) and *reconciles* their rows — an entry that is still there keeps its row,
with its open folders, its listeners and anything a drag is over — while the rest of the
tree is not looked at at all. A folder that is folded is not even listed: its `loaded` flag
is dropped so it lists afresh when it opens. `tree-drag.js` holds the result: after a move,
the rows the move never reached are asserted to be the *same DOM elements*, and a mark left
on the page (`window.__treeProbeLoaded`) is still there, which a page reload would have
cleared. The refusals moved to their own probe (`tree-drag-refusals.js`) to keep both
inside the bridge's five seconds.

**Round four: the page must not reload at all.** The user's report: the tree updates
immediately now, but the *webview* still refreshes and takes the page away. Measured, and
the cause is the environment rather than the tree's own code: the app is opened on
`test/fixtures/workspace`, which lives *inside the repository*, so every write the tree
makes there is a change under Vite's watcher — and the dev server answers changes it cares
about with a full page reload. Two changes, one of them a guard against the other way a
page can be taken away:

1. `vite.config.ts`'s watcher now ignores `/test/fixtures/workspace/`, beside the
   `src-tauri` it already ignored: those files are *data* — a notes folder the app writes
   to — not source. (Honest note: a probe with the marker below passes *with and without*
   this ignore on this machine, because Vite only reloads for files it has in its module
   graph and a fixture file is not one. It is kept because the fixtures are data, and
   because what a dev server does with a file outside its graph is version-dependent.)
2. A tree row is not a **native drag source**, three ways over: `draggable` is false, a
   `dragstart` on a row is refused, and `styles.css` sets `-webkit-user-drag: none` on every
   `[data-tree-path]`. That is what makes a *real* mouse drag safe: the webview cannot take
   the press over (which is what left the pointer drag dead), and a native drop cannot take
   the webview to the path it carries — the other way the page can disappear under the
   reader.

The new probe is `test/probes/tree-no-reload.js`, and it is the first one that works *in
the fixture workspace* rather than in `/private/tmp`: it makes two folders with the app's
own actions, moves one into the other, and checks that a mark left on the page is still
there afterwards (plus that no row can be a native drag source). Before it, every
workspace probe worked in a temporary folder outside the repository, which is exactly why
none of them could have seen this.
