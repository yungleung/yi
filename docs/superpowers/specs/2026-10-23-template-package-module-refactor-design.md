# Split the template-package Rust modules

## Problem

The template-package backend has outgrown two central files:

- `export/templates/scan.rs` is 1,159 lines and combines source listing, file limits, folder and
  ZIP safety, entry detection, wrapper generation and tests.
- `export/templates/package.rs` is 942 lines and combines package lifecycle operations, editor file
  access, summaries, aliases, path safety, name allocation and tests.

The size is not only cosmetic. A change to ZIP extraction, for example, currently requires reading
past package import, entry detection and wrapper logic. The tests live at the bottom of the same
files, so responsibility boundaries are difficult to see and review.

## Goals

- Preserve every public behavior, error message, safety rule and Tauri command.
- Keep `templates::scan` and `templates::package` as stable module facades, avoiding caller churn.
- Give each extracted module one reason to change.
- Keep most files below roughly 400 lines, including their tests.
- Split tests by the behavior they exercise instead of retaining two large test blocks.
- Make the refactor independently reviewable as a behavior-preserving change.

## Non-goals

- Changing import, detection, validation, manifest or package lifecycle behavior.
- Renaming Tauri commands or changing their payloads.
- Refactoring `export/run.rs`, `export/tests/run.rs`, fonts, settings or versioning in this change.
- Introducing traits, dependency injection or new abstractions without an independent need.

## Stable facade

The current module names remain:

```text
export/templates/scan.rs    -> export/templates/scan/mod.rs
export/templates/package.rs -> export/templates/package/mod.rs
```

`templates/mod.rs` continues to import and re-export the same types and functions. Existing callers
such as `export/run.rs`, `validate.rs` and the Tauri command surface remain unchanged.

## Scan modules

```text
export/templates/scan/
  mod.rs
  source.rs
  archive.rs
  detection.rs
  wrapper.rs
  tests.rs
```

### `mod.rs`

Owns the serialized scan vocabulary (`TemplateKind`, `ScannedFile`, `WrapperProposal`,
`ScannedSource`) and the `inspect` orchestration. It connects the source listing to detection and
adds the wrapper proposal; it does not implement folder or ZIP internals.

### `source.rs`

Owns single-file, folder and source-level rules:

- `MAX_FILES` and `MAX_BYTES`;
- source type;
- `list_files` and its aggregate limits;
- `single_file`, `folder_files` and `walk_folder`;
- `read_file`, `copy_into` and relative-path safety;
- package/source basename handling.

### `archive.rs`

Owns the ZIP boundary:

- ZIP entry listing and limits;
- symlink and unsafe-name refusal;
- single-root stripping;
- reading one ZIP entry;
- extraction into staging;
- ZIP-specific error translation.

No parser or detection rule lives here.

### `detection.rs`

Owns what an already-listed source means:

- extension classification;
- TeX candidate scoring and tie handling;
- entry and suggested-kind selection;
- mode detection;
- CSL detection;
- asset and deliver filtering;
- complete-document detection used by wrapper proposals.

### `wrapper.rs`

Owns complete-document conversion:

- inserting `$body$` before `\end{document}`;
- escaping literal dollars;
- choosing wrapper and source names beside the original;
- balanced replacement of `\title` and `\author`;
- command detection.

### `tests.rs`

Contains the existing scan tests, grouped by source limits, folder behavior, ZIP safety, detection,
and wrapper conversion. Tests continue to exercise the public facade rather than private helpers
unless the helper itself is the rule under test.

## Package modules

```text
export/templates/package/
  mod.rs
  import.rs
  library.rs
  editor.rs
  alias.rs
  storage.rs
  tests.rs
```

### `mod.rs`

Owns the serialized request/response vocabulary (`ImportRequest`, `DetailsPatch`, `TemplateSummary`,
`TemplateFileInfo`) and re-exports the public operations. It is the stable facade used by
`templates/mod.rs`.

### `import.rs`

Owns package creation and mutation:

- inspect and wrapper-preview bridges into `scan`;
- import and staged package construction;
- create-from-Pandoc-default;
- details updates that rewrite the manifest and entry;
- validation of the requested kind and entry.

### `library.rs`

Owns package discovery and lifecycle:

- the template data directory;
- listing and summaries;
- duplicate and remove;
- package resolution by id;
- manifest-read failure reporting.

### `editor.rs`

Owns the code panel's package-file contract:

- editable/read-only classification;
- atomic reads and writes;
- refusal to edit or replace `template.json` through the editor.

### `alias.rs`

Owns export-time package lookup from relative template paths:

- alias names;
- staging the package under its source basename;
- directory links on Unix and Windows;
- cleanup behavior.

### `storage.rs`

Owns shared filesystem rules:

- safe package id/path resolution;
- unique asset and entry-name allocation;
- package file listing and editable/read-only classification;
- package directory copying;
- text/reference entry extension predicates.

The split avoids a generic `utils.rs`; each helper belongs to the operation family that owns its
invariants.

## Dependency direction

The dependency graph remains acyclic:

```text
templates/mod
  -> package facade
       -> package/import
            -> scan facade
       -> package/library
       -> package/editor
       -> package/alias
       -> package/storage

scan facade
  -> source
  -> archive
  -> detection
  -> wrapper
```

`source` and `archive` do not depend on detection. `detection` and `wrapper` do not write packages.
`package/import` may coordinate scan and manifest rules, but lower-level package modules do not call
back into the facade.

## Behavior preservation

The refactor does not alter:

- accepted source types and file limits;
- ZIP root stripping or symlink/path traversal refusal;
- TeX entry ranking and ambiguity handling;
- wrapper preview or generated text;
- manifest fields, IDs, names or provenance;
- package-directory layout or atomic staging;
- editable file classification;
- alias behavior on either operating system;
- JSON/IPC field names;
- reader-facing error strings.

All existing tests should pass with imports adjusted only where private test access changed. No test
expectation is changed merely to fit the new file layout.

## Verification

The refactor is complete when:

- `cargo test` passes with the same test count and no new warnings;
- `npm run check` passes all checks;
- `npm run build` succeeds;
- `npm run probe:all` passes the full Tauri suite;
- `cargo fmt --check` is applied only to changed files without reformatting unrelated Rust files;
- template import, details update, editor read/write, duplicate/remove, wrapper preview, validation,
  alias staging and export paths remain covered by their existing Rust tests and probes;
- `docs/architecture.md` and `docs/ai-context.md` name the new module boundaries without changing
  the feature description.

## Acceptance

The change is accepted when the two facades retain their existing callers, every extracted module
has one clear responsibility, the oversized test blocks are split, no behavior changes are
introduced, and the complete Rust and Tauri verification suite passes.
