# Rust backend module boundaries

## Problem

Three parts of the Rust backend have grown past what one file can explain at once:

- `src-tauri/src/export.rs` is 1,861 lines. It holds the kind table, export paths and
  configuration files, pandoc and curl discovery, remote picture handling, argument assembly,
  the export run, and the font hints the card shows.
- `src-tauri/src/versioning.rs` is 926 lines. It holds git discovery, repository and cloud facts,
  repository creation, commits, and reading versions.
- `export_fonts.rs` (526 lines), `font_file.rs` (358) and `system_fonts.rs` (238) are one family —
  the tables inside a font file, the faces this build ships, and the faces the machine has — but
  they sit as three unrelated top-level modules.

The cost is navigational rather than behavioural. A reader looking for "how is a picture fetched"
has to scan a file that also decides which kinds exist; a reader looking at a font table has to
know that the three font modules are related. The files also make module-level tests and imports
harder to keep local.

## Goals

- Split `export` into one module per responsibility.
- Collect the three font modules under one `fonts` family.
- Split `versioning` the same way as the second pass.
- Move tests beside the code they test.
- Preserve every command path used by `lib.rs` and every public item used elsewhere.
- Make no behaviour change, rename no command, move no asset, and change no dependency.
- Update the project maps after the moves.

`settings.rs`, `files.rs`, `i18n.rs`, `menu.rs`, `session.rs`, `access.rs` and `stats.rs` are not
in scope. The 181-line `access.rs` and 422-line `files.rs` do not currently carry enough separate
jobs to justify a split.

## Design

### Top level

`src-tauri/src/lib.rs` declares the domain modules:

```rust
mod export;
mod fonts;
mod versioning;
```

`export_fonts`, `font_file` and `system_fonts` disappear as top-level modules. Their contents move
under `fonts`.

### `export/`

```text
export/
  mod.rs
  kinds.rs
  info.rs
  config.rs
  search.rs
  pandoc.rs
  curl.rs
  pictures.rs
  font_hints.rs
  run.rs
```

- **`kinds.rs`** — the vocabulary of an export: `ExportKind`, `KINDS`, `PAPER_SIZES`, `kind_of`
  and `config_file_name`. It is data and pure rules only; it imports no sibling.
- **`info.rs`** — what the card is told about the kinds: `ExportKindInfo`, `ExportKinds`,
  `export_kinds` and `kind_info`. It asks `kinds` for the rows and `config` for the export folder.
- **`config.rs`** — where a run's files live and how a kind's defaults and CSL styles are put
  there: `export_dir`, `tmp_dir`, `remote_dir`, `ensure_defaults_in`, `CslStyle`,
  `style_file_name`, `ensure_csl_in`, `export_config_path`, `export_restore_config` and
  `settings_text`.
- **`pandoc.rs`** — the pandoc seam: known locations, `find_pandoc`, `export_use_pandoc` and
  `run_pandoc`.
- **`curl.rs`** — the curl seam: known locations, `find_curl`, `export_use_curl` and `run_curl`.
- **`search.rs`** — the shared search order for an external program: a named binary first, then
  the known places, then `PATH`.
- **`pictures.rs`** — a picture from the web: content-type extension, URL hashing and naming,
  `download_image` and `export_fetch_image`. Its temporary folder is `config::remote_dir`.
- **`font_hints.rs`** — what the card says about fonts: `NamedFonts`, `export_named_fonts`,
  `export_font_for` and `named_fonts`. It asks `crate::fonts::bundled` and
  `crate::fonts::system`.
- **`run.rs`** — one export: `ExportRequest`, `ExportOutcome`, `run_export`, `export_own_text`,
  `export_with_pandoc`, `write_note`, `pandoc_arguments` and `warnings_in`.
- **`mod.rs`** — module declarations and the public surface. It re-exports the command functions
  and public types so existing paths such as `export::run_export`, `export::export_kinds` and
  `export::KINDS` keep working.

Dependencies point inward:

- `kinds` imports no sibling.
- `config` imports `kinds`.
- `pandoc` and `curl` import `search`.
- `pictures` imports `config` and `curl`.
- `info` imports `kinds` and `config`.
- `font_hints` imports `config` and the font family.
- `run` imports `kinds`, `config`, `pandoc` and the font family.
- `mod` declares and re-exports the rest.

No sibling imports `run` or `info`.

### `fonts/`

```text
fonts/
  mod.rs
  file.rs
  bundled.rs
  system.rs
```

- **`file.rs`** — the parser over a font file's own tables: `faces`, `table`, `family_names`,
  `cmap_ranges`, `format_four`, `format_twelve`, `be16`, `be32` and `read_tables`.
- **`bundled.rs`** — the faces this build ships and the LaTeX header that wires them in:
  `FACES`, `HAN_FACE`, `Slot`, `SLOTS`, `HEADER_FILE`, `fonts_dir`, `write_header`,
  `style_options`, `named`, `reader_scripts`, `named_values`, `folder`, `coverage` and
  `routed_to_han`.
- **`system.rs`** — the faces the machine has: `families`, `has_family`, `covering`, `coverages`,
  `paths`, `directories` and `collect`.
- **`mod.rs`** — says what the family is for and declares the three modules. Callers use
  `crate::fonts::bundled`, `crate::fonts::system` and `crate::fonts::file`; no wildcard
  re-exports, so the reader can see which part of the family a call belongs to.

### `versioning/`

```text
versioning/
  mod.rs
  git.rs
  facts.rs
  versions.rs
```

- **`git.rs`** — the git seam and the writes: `Identity`, known locations, `find_git`,
  `versioning_use_git`, `run_git`, `git_to_run`, `identity_of`, `separate_git_dir`,
  `init_workspace_repository`, `init_repository_at`, `commit_paths` and `commit_at`.
- **`facts.rs`** — what is true of a folder: `RepositoryShape`, `VersioningFacts`,
  `repository_shape`, `cloud_kind`, `content_is_offloaded`, `dirs_home` and `versioning_facts`.
- **`versions.rs`** — versions of a note: `Version`, `versions_from`, `read_versions`,
  `version_text_arguments`, `read_version_text`, `versioning_version_text` and
  `versioning_history`.
- **`mod.rs`** — re-exports the command functions and types at `versioning::…`, preserving the
  paths in `lib.rs`.

## Visibility

The split must not widen the public surface. Items used only by a sibling become `pub(super)`;
items already public for `lib.rs`, the menu or a probe stay public through `mod.rs`. Tests move
into the module whose private helpers they exercise, so no helper becomes public only for a test.

The public command names stay exactly as they are:

```text
export::{export_kinds, run_export, export_config_path, export_restore_config,
         export_named_fonts, export_font_for, export_fetch_image,
         export_use_pandoc, export_use_curl}
versioning::{versioning_facts, versioning_use_git, versioning_history,
             versioning_version_text, init_workspace_repository, commit_paths}
```

`menu.rs` continues to use `crate::export::KINDS`. `lib.rs` changes only its module declarations.

## Migration order

Each step is a mechanical move, with tests moved beside their subject and no logic edited.

1. **`fonts/`.** Move the three files, update their module headers and imports, and update the
   call sites in `export.rs`. This is the smallest family and proves the facade shape.
2. **`export/`.** Move the declared units, split the existing tests by subject, and add the
   `mod.rs` re-exports. The order inside this step is `kinds`, `config`, `search`, `pandoc`,
   `curl`, `pictures`, `info`, `font_hints`, `run`.
3. **`versioning/`.** Move `git`, facts and versions, split tests by subject, and add the
   `mod.rs` re-exports.
4. **Maps.** Update `docs/structure.md` and `docs/ai-context.md` with the new paths and sizes.

## Testing

After each step:

- `cargo test --offline` — every Rust unit test, including the tests that moved.
- `npm run check` — the locale and menu-event scans, locating rules and headers after the moves.

After `export/` and again after `versioning/`, run the probes that drive those domains:

- `export-kinds`, `export-docx`, `export-pdf`, `export-web-image`, `export-picture-formats`.
- `versioning-facts`, `versioning-save`, `versioning-history`.

The final step is a full `npm run probe:all` on a fresh dev app, because a Rust module move changes
the binary and the app must be restarted before a probe measures it.

## Acceptance criteria

- No production file in `export/`, `fonts/` or `versioning/` carries more than one of the
  responsibilities listed above.
- Every moved module opens with a header saying what it is for, what it may import and what it
  upholds.
- Every command path and public type path used by `lib.rs` or `menu.rs` is unchanged.
- No asset, dependency, command, user-facing string or behaviour changes.
- `cargo test --offline`, `npm run check` and the relevant probes pass after each step; the full
  suite passes at the end.

## Risks

- **Rust privacy follows modules, not files.** A test that reached a private helper in one file
  will not reach it in a sibling after the move. The mitigation is to move the test into that
  sibling rather than making the helper public.
- **Path scans outside Cargo.** `check-events` reads top-level Rust files for menu events and
  `check-locales` reads the Rust tree for keys. The refactor leaves `menu.rs` in place and keeps
  every i18n call in the domain modules; both checks run after every step.
- **A move hiding a behaviour change.** Each step is reviewed as a move: signatures, bodies and
  tests are unchanged except for paths and visibility. The probes are the external check that the
  app still does the same thing.
