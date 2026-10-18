# Rust Backend Module Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the oversized Rust export and versioning modules and group the three font modules into a `fonts` family, with no behaviour or public-command change.

**Architecture:** Keep `export` and `versioning` as the public module names, turn each into a directory with a small `mod.rs` facade, and move one responsibility into each child module. The font family becomes `fonts::{file, bundled, system}`. Tests move beside the functions they exercise; internal helpers become `pub(super)` only where a sibling needs them.

**Tech Stack:** Rust, Tauri commands, Cargo tests, Node checks and Tauri probes.

**Spec:** `docs/superpowers/specs/2026-10-18-rust-module-boundaries-design.md`

## Global Constraints

- No behaviour change: move signatures, bodies and tests without editing logic.
- Preserve every command path: `export::run_export`, `export::export_kinds`, `versioning::versioning_facts`, and every other public path already used by `lib.rs` or `menu.rs`.
- Preserve every public type reached through those command signatures.
- Move no asset and change no dependency.
- Every new Rust module opens with a `//!` header saying what it is for, what it may import and what it upholds.
- Tests live beside the module whose private helpers they exercise.
- Commit each independently testable domain move.
- Work on `codex/the-rust-modules-find-their-homes`; never commit to `main`.

---

## File Structure

```text
src-tauri/src/
  export/
    mod.rs
    kinds.rs
    info.rs
    config.rs
    pandoc.rs
    curl.rs
    pictures.rs
    font_hints.rs
    run.rs
  fonts/
    mod.rs
    file.rs
    bundled.rs
    system.rs
  versioning/
    mod.rs
    git.rs
    facts.rs
    versions.rs
```

## Task 1: Move the font family under `fonts/`

**Files:**
- Move: `src-tauri/src/font_file.rs` -> `src-tauri/src/fonts/file.rs`
- Move: `src-tauri/src/export_fonts.rs` -> `src-tauri/src/fonts/bundled.rs`
- Move: `src-tauri/src/system_fonts.rs` -> `src-tauri/src/fonts/system.rs`
- Create: `src-tauri/src/fonts/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/export.rs`

**Interfaces:**
- Produces: `crate::fonts::file::{faces, table, family_names, cmap_ranges, read_tables}`
- Produces: `crate::fonts::bundled::{fonts_dir, write_header, named, reader_scripts, named_values, coverage}`
- Produces: `crate::fonts::system::{has_family, covering}`

- [ ] **Step 1: Move the three files with history**

```bash
mkdir -p src-tauri/src/fonts
git mv src-tauri/src/font_file.rs src-tauri/src/fonts/file.rs
git mv src-tauri/src/export_fonts.rs src-tauri/src/fonts/bundled.rs
git mv src-tauri/src/system_fonts.rs src-tauri/src/fonts/system.rs
```

- [ ] **Step 2: Add the family module**

Create `src-tauri/src/fonts/mod.rs`:

```rust
//! The font family: what a font file says, what this build ships, and what this machine has.
//!
//! `file` reads the tables inside a font; `bundled` owns the faces and LaTeX header this build
//! ships; `system` answers what the machine's installed families can draw. They are one module
//! because a question about a glyph is always answered by reading a font file, and the two
//! readers must not grow separate parsers.
//!
//! May import: nothing — the children import their own dependencies.
//! Upholds: one parser for a font file, one home for the shipped faces, and one reader of the
//! machine's fonts.

pub mod bundled;
pub mod file;
pub mod system;
```

- [ ] **Step 3: Point the crate at the family**

In `src-tauri/src/lib.rs`, replace `mod export_fonts; mod font_file; mod system_fonts;` with:

```rust
mod fonts;
```

- [ ] **Step 4: Update imports and headers**

- In `fonts/system.rs`, change `use crate::font_file;` to `use crate::fonts::file;`.
- In `fonts/bundled.rs`, change every `crate::font_file::` to `crate::fonts::file::`.
- In `export.rs`, change `crate::export_fonts::` to `crate::fonts::bundled::` and
  `crate::system_fonts::` to `crate::fonts::system::`.
- Change the three moved module headers to name their new paths and the family they belong to.
- Keep every function body and every test name unchanged.

- [ ] **Step 5: Verify**

```bash
cargo test --offline
npm run check
```

Expected: 76 Rust tests pass; all Node checks pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/fonts src-tauri/src/lib.rs src-tauri/src/export.rs
git commit -m "refactor(fonts): one family for parsing, shipping and finding faces"
```

## Task 2: Split `export` into one module per responsibility

**Files:**
- Move: `src-tauri/src/export.rs` -> `src-tauri/src/export/mod.rs`
- Create: `src-tauri/src/export/kinds.rs`
- Create: `src-tauri/src/export/info.rs`
- Create: `src-tauri/src/export/config.rs`
- Create: `src-tauri/src/export/pandoc.rs`
- Create: `src-tauri/src/export/curl.rs`
- Create: `src-tauri/src/export/pictures.rs`
- Create: `src-tauri/src/export/font_hints.rs`
- Create: `src-tauri/src/export/run.rs`

**Interfaces:**
- Consumes: the `fonts` family from Task 1.
- Produces: `export::{ExportKind, PaperSize, KINDS, PAPER_SIZES, ExportKindInfo, ExportKinds}`
- Produces: `export::{export_kinds, run_export, export_config_path, export_restore_config, export_named_fonts, export_font_for, export_fetch_image, export_use_pandoc, export_use_curl}`
- Produces: `export::{ExportRequest, ExportOutcome, NamedFonts, CslStyle, find_pandoc, find_curl}`

- [ ] **Step 1: Move the parent file**

```bash
mkdir -p src-tauri/src/export
git mv src-tauri/src/export.rs src-tauri/src/export/mod.rs
```

- [ ] **Step 2: Create `kinds.rs`**

Move these items and their tests from `export/mod.rs`:

```text
ExportKind
PaperSize
PAPER_SIZES
KINDS
kind_of
config_file_name
the tests a_kinds_config_file_is_named_for_the_kind,
a_kind_the_app_does_not_ship_is_refused_by_name,
every_shipped_kind_names_the_reader_and_writer_pandoc_is_given_and_the_file_that_comes_out
```

Keep the existing doc comments. Add a `//!` header saying the module is the export vocabulary and
page-size list, may import only `serde`, and upholds one row per shipped kind.

- [ ] **Step 3: Create `config.rs`**

Move these items and their tests:

```text
CslStyle
export_dir
tmp_dir
remote_dir
ensure_defaults_in
style_file_name
ensure_csl_in
export_config_path
export_restore_config
settings_text
the tests a_copy_the_build_ships_is_known_to_be_that_one,
the_defaults_file_is_written_once_and_an_edited_one_is_kept,
a_style_lands_in_a_file_named_for_the_style_and_nowhere_else,
the_style_is_written_once_and_replaced_when_the_style_changes,
the_kind_pandoc_does_not_write_is_the_kind_with_no_defaults_file
```

The module header says it owns the app's export folder, defaults files and CSL copies; it may
import `kinds` and the app's files; its invariant is that a file already there is never rewritten.

- [ ] **Step 4: Create `pandoc.rs` and `curl.rs`**

Move `known_pandoc_locations`, `find_pandoc_from`, `find_pandoc`, `export_use_pandoc`,
`run_pandoc` and their pandoc tests into `pandoc.rs`.

Move `known_curl_locations`, `find_curl`, `export_use_curl`, `run_curl` and
`a_curl_named_by_the_test_seam_is_the_one_that_is_run` into `curl.rs`.

Each file keeps the seam state and the one argument list in its own header.

- [ ] **Step 5: Create `pictures.rs`**

Move `image_extension`, `url_hash`, `remote_file_name`, `download_image`,
`export_fetch_image`, and the tests `a_picture_is_named_for_its_own_type_and_never_for_a_path` and
`a_fetched_picture_can_only_name_a_file_below_its_own_folder`.

The header says it owns a web picture's download and name, imports `config` and `curl`, and never
lets a server's name escape the run's remote folder.

- [ ] **Step 6: Create `info.rs`**

Move `ExportKindInfo`, `ExportKinds`, `export_kinds`, `kind_info` and
`only_the_kind_whose_page_the_shipped_faces_draw_ships_fonts`.

It imports `kinds` and `config`; its header says it answers what the card shows about the shipped
kinds and does not write anything.

- [ ] **Step 7: Create `font_hints.rs`**

Move `NamedFonts`, `export_named_fonts`, `export_font_for`, `named_fonts`, and the tests
`a_file_names_its_fonts_and_a_comment_names_nothing` and
`a_file_names_a_font_when_a_line_that_is_not_a_comment_says_so`.

It imports `config` and `crate::fonts::bundled` / `crate::fonts::system`; its header says it tells
the card which named faces the machine lacks and which face can cover missing characters.

- [ ] **Step 8: Create `run.rs`**

Move `ExportOutcome`, `ExportRequest`, `write_note`, `run_export`, `export_own_text`,
`export_with_pandoc`, `pandoc_arguments`, `warnings_in`, the helpers `request_in`,
`named_arguments`, `named_arguments_for`, `scratch`, and the run tests:

```text
the_arguments_are_the_whole_of_what_the_app_asks_pandoc_for
a_library_that_is_not_there_is_not_named_at_all
no_style_at_all_is_no_style_argument
only_a_kind_that_carries_its_own_name_is_told_what_the_note_is_called
only_a_book_is_handed_a_body_of_the_windows_making
a_page_a_reader_asks_for_is_a_geometry_option
a_list_the_reader_does_not_want_is_suppressed_in_metadata
the_kind_whose_output_would_be_the_note_itself_names_it_otherwise
what_pandoc_says_on_the_way_is_kept_line_by_line
```

It imports `kinds`, `config`, `pandoc` and `crate::fonts::bundled`; its header says it owns one
run from note to output and that every pandoc call goes through `pandoc::run_pandoc`.

- [ ] **Step 9: Make `mod.rs` a facade**

After the blocks have moved, `export/mod.rs` contains only declarations, public re-exports and
its `//!` overview:

```rust
mod config;
mod curl;
mod font_hints;
mod info;
mod kinds;
mod pandoc;
mod pictures;
mod run;

pub use config::{export_config_path, export_restore_config, CslStyle};
pub use curl::{export_use_curl, find_curl};
pub use font_hints::{export_font_for, export_named_fonts, NamedFonts};
pub use info::{export_kinds, ExportKindInfo, ExportKinds};
pub use kinds::{ExportKind, PaperSize, KINDS, PAPER_SIZES};
pub use pandoc::{export_use_pandoc, find_pandoc};
pub use pictures::export_fetch_image;
pub use run::{run_export, ExportOutcome, ExportRequest};
```

Use `pub(super)` for a helper used by a sibling, not `pub`, unless it is already a public path
listed above. `menu.rs` continues to use `crate::export::KINDS`; `lib.rs` command paths do not
change.

- [ ] **Step 10: Verify**

```bash
cargo test --offline
npm run check
npm run probe -- test/probes/export-kinds.js
npm run probe -- test/probes/export-docx.js
npm run probe -- test/probes/export-pdf.js
npm run probe -- test/probes/export-web-image.js
npm run probe -- test/probes/export-picture-formats.js
```

Expected: all Rust tests and Node checks pass; every export probe reports `failed: []`.

- [ ] **Step 11: Commit**

```bash
git add src-tauri/src/export
git commit -m "refactor(export): one module for each job an export does"
```

## Task 3: Split `versioning`

**Files:**
- Move: `src-tauri/src/versioning.rs` -> `src-tauri/src/versioning/mod.rs`
- Create: `src-tauri/src/versioning/git.rs`
- Create: `src-tauri/src/versioning/facts.rs`
- Create: `src-tauri/src/versioning/versions.rs`

**Interfaces:**
- Produces: `versioning::{versioning_facts, versioning_use_git, versioning_history, versioning_version_text, init_workspace_repository, commit_paths}`
- Produces: `versioning::{RepositoryShape, VersioningFacts, Identity, Version, find_git}`

- [ ] **Step 1: Move the parent file**

```bash
mkdir -p src-tauri/src/versioning
git mv src-tauri/src/versioning.rs src-tauri/src/versioning/mod.rs
```

- [ ] **Step 2: Create `git.rs`**

Move `Identity`, `find_git_from`, `known_git_locations`, `git_for_tests`,
`command_line_tools_are_installed`, `find_git`, `versioning_use_git`, `run_git`, `git_to_run`,
`identity_of`, `separate_git_dir`, `init_workspace_repository`, `init_repository_at`,
`commit_paths`, `commit_at` and their git/commit tests.

Its header says it owns which git may run, the one argument list, identity, initialization and
commits; it imports `std`, `tauri` and the app's i18n.

- [ ] **Step 3: Create `facts.rs`**

Move `RepositoryShape`, `VersioningFacts`, `repository_shape`, `cloud_kind`,
`content_is_offloaded`, `dirs_home`, `versioning_facts` and the repository/cloud tests.

It imports `git` for `Identity`, `separate_git_dir` and `find_git`; its header says it answers
facts about a folder and its cloud risk.

- [ ] **Step 4: Create `versions.rs`**

Move `Version`, `versions_from`, `read_versions`, `version_text_arguments`, `read_version_text`,
`versioning_version_text`, `versioning_history` and the version-row/option tests.

It imports `git` for `git_to_run`; its header says it reads a note's versions and never writes one.

- [ ] **Step 5: Make `mod.rs` a facade**

```rust
mod facts;
mod git;
mod versions;

pub use facts::{versioning_facts, RepositoryShape, VersioningFacts};
pub use git::{
    commit_paths, find_git, init_workspace_repository, versioning_use_git, Identity
};
pub use versions::{versioning_history, versioning_version_text, Version};
```

Keep every command path used by `lib.rs` unchanged.

- [ ] **Step 6: Verify**

```bash
cargo test --offline
npm run check
npm run probe -- test/probes/versioning-facts.js
npm run probe -- test/probes/versioning-save.js
npm run probe -- test/probes/versioning-history.js
```

Expected: all Rust tests and Node checks pass; every versioning probe reports `failed: []`.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/versioning
git commit -m "refactor(versioning): separate git, folder facts and versions"
```

## Task 4: Update the maps and run the full suite

**Files:**
- Modify: `docs/structure.md`
- Modify: `docs/ai-context.md`

- [ ] **Step 1: Update the path map**

In `docs/structure.md`, replace the old `src-tauri/src/*.rs` row and any `export_fonts.rs`,
`font_file.rs`, `system_fonts.rs` or `versioning.rs` paths with the new tree and its line counts.

- [ ] **Step 2: Update the working brief**

In `docs/ai-context.md`, update every path that points at the old flat modules, including the
export, fonts and versioning sections.

- [ ] **Step 3: Restart the app and run the full verification**

```bash
npx tsc --noEmit
npm run check
cargo test --offline
```

Restart `npm run tauri dev` after the Rust module move, then:

```bash
npm run probe:all
```

Expected: every check passes and the full probe run reports no failures.

- [ ] **Step 4: Commit**

```bash
git add docs/structure.md docs/ai-context.md
git commit -m "docs(structure): the Rust domains and their modules"
```

## Self-Review

- Every spec section has a task: the font family in Task 1, export in Task 2, versioning in
  Task 3, maps and the final suite in Task 4.
- Every moved item is named; no code placeholder is left.
- Interfaces name the exact module paths and command paths that the next task consumes.
- The tasks preserve the spec's no-behaviour-change and no-public-path-change constraints.
