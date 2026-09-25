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

- [ ] Task 1: the filesystem commands and their Rust tests, with the wrappers in
      `src/api/files.ts`.
- [ ] Task 2: the pure rules — the menu model, the name selection, the drop rules — with
      Node checks.
- [ ] Task 3: the tree in its new folder, with the context menu and its five actions
      (rename, delete, new file, new subfolder, reveal, copy path/name/id).
- [ ] Task 4: the inline rename, with the layout assertion the user asked for.
- [ ] Task 5: the drag and drop.
- [ ] Task 6: the probes (a temporary workspace the probe makes and removes; the inline
      rename's layout and selection; a move and its refusals; the create/delete/copy/
      reveal actions), the docs (`docs/architecture.md`, `docs/ai-context.md`, `test/README.md`,
      `docs/roadmap.md`), and acceptance — `npx tsc --noEmit`, `npm run check`, a fresh
      `npm run tauri dev`, `npm run probe:all`, plus `cargo test` for the new commands.

## Handoff

To be written when the feature is in.
