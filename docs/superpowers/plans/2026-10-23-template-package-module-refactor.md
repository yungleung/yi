# Template Package Module Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the oversized template scan and package modules into focused Rust files without changing behavior, public commands or safety rules.

**Architecture:** Keep `templates::scan` and `templates::package` as stable facades by converting each module file into a directory with `mod.rs`. Extract source/ZIP/detection/wrapper and lifecycle/editor/alias/storage responsibilities into sibling modules, preserving exact interfaces and tests.

**Tech Stack:** Rust 2024, Tauri v2, serde, zip, Rust unit tests, Node checks, Tauri probes.

**Spec:** `docs/superpowers/specs/2026-10-23-template-package-module-refactor-design.md`

## Global Constraints

- Preserve every public behavior, reader-facing error, safety rule, manifest field, Tauri command and JSON/IPC shape.
- Keep `super::scan::…` and `super::package::…` caller paths unchanged.
- Do not change `export/run.rs`, font, settings or versioning modules.
- Do not introduce a generic `utils.rs`.
- Each extracted module has one reason to change and a header naming imports and invariants.
- Existing test expectations are not changed to fit the new layout.
- Run focused Rust tests after each task and the complete verification suite at the end.
- Work only on `codex/template-authoring`; never merge.

---

### Task 1: Establish the Scan Facade and Extract Source Rules

**Files:**
- Rename: `src-tauri/src/export/templates/scan.rs` → `src-tauri/src/export/templates/scan/mod.rs`
- Create: `src-tauri/src/export/templates/scan/source.rs`
- Modify: `src-tauri/src/export/templates/mod.rs`

**Interfaces:**
- Consumes: existing `ScannedFile`, `MAX_FILES`, `MAX_BYTES`, `source_type`, `list_files`,
  `read_file`, `copy_into`, `relative`.
- Produces:
  - `source::MAX_FILES: usize`
  - `source::MAX_BYTES: u64`
  - `source::list_files(&Path) -> Result<Vec<ScannedFile>, String>`
  - `source::read_text(&Path, &str) -> Result<String, String>`
  - `source::read_file(&Path, &str) -> Result<Vec<u8>, String>`
  - `source::copy_into(&Path, &Path) -> Result<(), String>`
  - `source::relative(&str) -> Result<PathBuf, String>`

- [ ] **Step 1: Run the existing scan characterization tests**

Run:

```bash
cd src-tauri
cargo test export::templates::scan::tests
```

Expected: PASS. This is the pre-refactor behavior baseline.

- [ ] **Step 2: Convert the file into a module directory**

Run:

```bash
mkdir -p src-tauri/src/export/templates/scan
git mv src-tauri/src/export/templates/scan.rs src-tauri/src/export/templates/scan/mod.rs
```

Add to `scan/mod.rs`:

```rust
mod archive;
mod detection;
mod source;
mod wrapper;

pub(super) use source::{copy_into, read_file, relative, MAX_BYTES, MAX_FILES};
```

Temporarily declare only `source`; add the other declarations in their own tasks.

- [ ] **Step 3: Move source-level helpers**

Move these functions and constants unchanged from `scan/mod.rs` to `scan/source.rs`:

```text
MAX_FILES
MAX_BYTES
source_type
list_files
read_text
read_file
copy_into
relative
single_name
single_file
folder_files
walk_folder
package_name
```

Use this module header and imports as the starting point:

```rust
//! Source-level template inspection: source type, file listing and safe path copies.
//!
//! May import: std and the scan facade's file vocabulary. Upholds: every listed or copied file is
//! regular, inside the source, and reported by a safe relative package path.

use super::ScannedFile;
use super::{archive, MAX_BYTES, MAX_FILES};
use std::fs;
use std::path::{Component, Path, PathBuf};
```

Keep `source_type`, `list_files`, `read_file`, `copy_into` and `relative` visible to siblings with
`pub(super)`.

- [ ] **Step 4: Restore facade exports**

At the end of `scan/mod.rs`, re-export the moved functions with their original module visibility:

```rust
pub(super) use source::{copy_into, read_file, relative, MAX_BYTES, MAX_FILES};
```

For now, call `source::list_files` and `source::source_type` through the `source` module from
`inspect`; do not duplicate wrapper functions only for indirection.

- [ ] **Step 5: Run compile and focused tests**

Run:

```bash
cd src-tauri
cargo test export::templates::scan::tests
```

Expected: PASS with the same tests as Step 1.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/export/templates/scan src-tauri/src/export/templates/scan.rs
git commit -m "refactor(export): extract template source scanning"
```

---

### Task 2: Extract ZIP Handling

**Files:**
- Create: `src-tauri/src/export/templates/scan/archive.rs`
- Modify: `src-tauri/src/export/templates/scan/mod.rs`
- Modify: `src-tauri/src/export/templates/scan/source.rs`

**Interfaces:**
- Consumes: `ScannedFile` and the source byte/file limits.
- Produces:
  - `archive::list_files(&Path) -> Result<Vec<ScannedFile>, String>`
  - `archive::read_file(&Path, &str) -> Result<Vec<u8>, String>`
  - `archive::extract(&Path, &Path) -> Result<(), String>`

- [ ] **Step 1: Run the ZIP-focused characterization tests**

Run:

```bash
cd src-tauri
cargo test export::templates::scan::tests::a_zip
cargo test export::templates::scan::tests::a_zip_entry_that_climbs_out_is_refused
```

Expected: PASS.

- [ ] **Step 2: Move ZIP-only code**

Move into `archive.rs` without changing logic:

```text
zip_files
zip_symlink
zip_name
strip_single_root
read_zip_file
ZipEntry
strip_found_root
extract_zip
```

Use this header:

```rust
//! Safe reading and extraction of a template ZIP archive.
//!
//! May import: std, zip and the scan facade's file vocabulary. Upholds: archive entries cannot
//! climb out, symlinks are refused, and extracted files preserve the inspected relative layout.
```

Expose the entry points as:

```rust
pub(super) fn list_files(source: &Path) -> Result<Vec<ScannedFile>, String>
pub(super) fn read_file(source: &Path, name: &str) -> Result<Vec<u8>, String>
pub(super) fn extract(source: &Path, target: &Path) -> Result<(), String>
```

- [ ] **Step 3: Route source and facade callers**

In `source.rs`:

```rust
let files = if source.is_dir() {
    folder_files(source)?
} else if source_type(source) == "zip" {
    archive::list_files(source)?
} else {
    single_file(source)?
};
```

Use the existing branching shape rather than introducing a new dispatch abstraction.

In the facade, call `source::read_file` for ZIP reads, `source::copy_into` for staging copies and
`archive::extract` for ZIP extraction.

- [ ] **Step 4: Run all scan tests**

Run:

```bash
cd src-tauri
cargo test export::templates::scan::tests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/export/templates/scan
git commit -m "refactor(export): extract template archive handling"
```

---

### Task 3: Extract Entry and Kind Detection

**Files:**
- Create: `src-tauri/src/export/templates/scan/detection.rs`
- Modify: `src-tauri/src/export/templates/scan/mod.rs`

**Interfaces:**
- Consumes: `source::read_file`, safe relative names and `ScannedFile`.
- Produces:

```rust
pub(super) struct Detection {
    pub kind: TemplateKind,
    pub entry: String,
    pub mode: TemplateMode,
    pub assets: Vec<String>,
    pub deliver: Vec<String>,
    pub warnings: Vec<String>,
    pub suggested_kind: Option<String>,
    pub csl: Option<String>,
    pub entry_candidates: Vec<String>,
    pub ambiguous_entry: bool,
}

pub(super) fn detect(
    source: &Path,
    files: &[ScannedFile]
) -> Result<Detection, String>
```

- [ ] **Step 1: Run detection characterization tests**

Run:

```bash
cd src-tauri
cargo test export::templates::scan::tests::a_tex_with_a_body
cargo test export::templates::scan::tests::an_xhtml_body
cargo test export::templates::scan::tests::equal_tex_candidates
cargo test export::templates::scan::tests::a_docx_and_no_tex
cargo test export::templates::scan::tests::a_lone_csl
cargo test export::templates::scan::tests::a_lone_defaults
cargo test export::templates::scan::tests::a_tex_and_a_reference_document
```

Expected: PASS.

- [ ] **Step 2: Move detection helpers**

Move into `detection.rs`:

```text
has_extension
extension_kind
ScoredTex
score_tex
sorted_tex_candidates
file_size
largest
mode_for_tex
deliver_for
```

Implement `Detection` and `detect` by moving the detection branches from `inspect` unchanged:
single-file refusal, TeX/HTML selection, reference-document selection, CSL/defaults refusal,
warnings, candidates and deliver derivation.

Use this header:

```rust
//! What an already-listed template source means: its entry, kind, mode, assets and warnings.
//!
//! May import: std, the scan file vocabulary and source readers. Upholds: entry ranking, ambiguity
//! and kind suggestions remain identical to the import inspector.
```

- [ ] **Step 3: Make the facade orchestrate**

First extract the current wrapper block from `inspect` into this local helper:

```rust
fn wrapper_for(
    source_entry: &str,
    text: &str,
    mode: TemplateMode,
) -> Result<Option<WrapperProposal>, String> {
    if mode != TemplateMode::Wrapper {
        return Ok(None);
    }
    let (preview, line) = insert_body(text)
        .ok_or_else(|| crate::i18n::now("template.noDocumentEnd", &[]))?;
    Ok(Some(WrapperProposal {
        source_entry: source_entry.to_string(),
        entry: wrapper_entry(source_entry),
        insertion: crate::i18n::now(
            "template.insertBeforeEnd",
            &[("line", &line.to_string())],
        ),
        preview,
        maps_title: has_command(text, "\\title"),
        maps_author: has_command(text, "\\author"),
    }))
}
```

Then replace the detection body of `inspect` with:

```rust
let files = source::list_files(source)?;
let detection = detection::detect(source, &files)?;
let wrapper_text = (detection.mode == TemplateMode::Wrapper)
    .then(|| source::read_text(source, &detection.entry))
    .transpose()?;
let wrapper = match wrapper_text {
    Some(text) => wrapper_for(&detection.entry, &text, detection.mode)?,
    None => None,
};
Ok(ScannedSource {
    kind: detection.kind,
    entry: detection.entry,
    mode: detection.mode,
    assets: detection.assets,
    deliver: detection.deliver,
    warnings: detection.warnings,
    source_type: source::source_type(source).to_string(),
    suggested_kind: detection.suggested_kind,
    csl: detection.csl,
    entry_candidates: detection.entry_candidates,
    ambiguous_entry: detection.ambiguous_entry,
    wrapper,
    files,
})
```

All existing `ScannedSource` fields and JSON names remain unchanged.

- [ ] **Step 4: Run scan tests**

```bash
cd src-tauri
cargo test export::templates::scan::tests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/export/templates/scan
git commit -m "refactor(export): separate template entry detection"
```

---

### Task 4: Extract Wrapper Rules and Split Scan Tests

**Files:**
- Create: `src-tauri/src/export/templates/scan/wrapper.rs`
- Create: `src-tauri/src/export/templates/scan/tests.rs`
- Modify: `src-tauri/src/export/templates/scan/mod.rs`

**Interfaces:**
- Consumes: detected entry text and the existing `WrapperProposal`.
- Produces:

```rust
pub(super) fn proposal(
    source_entry: &str,
    text: &str
) -> Result<WrapperProposal, String>

pub(super) fn insert_body(text: &str) -> Option<(String, usize)>
pub(super) fn wrapper_entry(entry: &str) -> String
pub(super) fn wrapper_source(entry: &str) -> String
pub(super) fn replace_argument(text: &str, command: &str, value: &str) -> String
```

- [ ] **Step 1: Run wrapper characterization tests**

```bash
cd src-tauri
cargo test export::templates::scan::tests::a_wrapper
```

Expected: PASS.

- [ ] **Step 2: Move wrapper code**

Move `insert_body`, `wrapper_entry`, `wrapper_source`, `sibling_entry`, `has_command` and
`replace_argument` to `wrapper.rs`. Add `proposal` containing the current wrapper construction from
`inspect`: insertion preview, sibling entry name, title mapping and author mapping.

Use this header:

```rust
//! Conversion of a complete LaTeX document into a Pandoc wrapper proposal.
//!
//! May import: std and the scan wrapper vocabulary. Upholds: `$body$` occurs once, literal dollars
//! survive Pandoc parsing, and title/author replacement is balanced and explicit.
```

- [ ] **Step 3: Move the inline tests**

Replace the inline `#[cfg(test)] mod tests { ... }` in `scan/mod.rs` with:

```rust
#[cfg(test)]
mod tests;
```

Move the existing tests unchanged to `scan/tests.rs`. Keep module-level imports as:

```rust
use super::*;
use std::io::Write as _;
use std::sync::atomic::{AtomicU32, Ordering};
```

Group tests with comments:

```text
Source and detection
Wrapper conversion
Archive safety
```

Do not rename tests or change assertions.

- [ ] **Step 4: Verify scan files are focused**

Run:

```bash
wc -l src-tauri/src/export/templates/scan/*.rs
cd src-tauri
cargo test export::templates::scan::tests
```

Expected: every scan file is below roughly 400 lines and tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/export/templates/scan
git commit -m "refactor(export): split template wrapper and scan tests"
```

---

### Task 5: Establish the Package Facade, Library and Storage

**Files:**
- Rename: `src-tauri/src/export/templates/package.rs` → `src-tauri/src/export/templates/package/mod.rs`
- Create: `src-tauri/src/export/templates/package/library.rs`
- Create: `src-tauri/src/export/templates/package/storage.rs`
- Modify: `src-tauri/src/export/templates/mod.rs`
- Modify: `src-tauri/src/export/templates/validate.rs`

**Interfaces:**
- Consumes: existing manifest rules and `scan::ScannedSource`.
- Produces:
  - `library::templates_dir`, `library::list_templates`, `library::summary_at`,
    `library::resolve_package`, `library::duplicate_template`, `library::remove_template`.
  - `storage::package_path`, `storage::package_files`, `storage::unique_asset_name`,
    `storage::unique_entry_name`, `storage::copy_directory`, `storage::is_text_name`,
    `storage::is_reference_entry`, `storage::nanos`.

- [ ] **Step 1: Run package characterization tests**

```bash
cd src-tauri
cargo test export::templates::package::tests
```

Expected: PASS.

- [ ] **Step 2: Convert package to a directory facade**

```bash
mkdir -p src-tauri/src/export/templates/package
git mv src-tauri/src/export/templates/package.rs src-tauri/src/export/templates/package/mod.rs
```

Keep all request/response structs and public operations re-exported from `mod.rs`.

- [ ] **Step 3: Extract library operations**

Move to `library.rs`:

```text
templates_dir
list_templates
duplicate_template
remove_template
resolve_package
summary_at
```

Use this header:

```rust
//! Template-package discovery and lifecycle: the app's template folder, summaries and resolution.
//!
//! May import: std, tauri, manifest rules and storage helpers. Upholds: package ids resolve only
//! below the app export template directory and broken packages remain listable for removal.
```

Keep the same `pub`/`pub(crate)` visibility.

- [ ] **Step 4: Extract storage helpers**

Move to `storage.rs`:

```text
package_path
unique_asset_name
unique_entry_name
is_text_entry
is_reference_entry
is_text_name
extension_of
copy_directory
nanos
package_files
collect_files
```

Use this header:

```rust
//! Shared package filesystem rules: safe ids, unique names, entry classification and copying.
//!
//! May import: std, manifest rules and editor file metadata. Upholds: package paths stay directly
//! below the template directory and no generated name overwrites an existing asset.
```

- [ ] **Step 5: Restore package facade exports**

In `package/mod.rs`:

```rust
pub(super) use library::templates_dir;
pub(crate) use library::resolve_package;
pub(super) use library::summary_at;
pub use library::{duplicate_template, list_templates, remove_template};
```

Re-export the exact helpers still consumed by the facade and tests:

```rust
pub(super) use storage::{
    copy_directory, nanos, package_files, unique_asset_name, unique_entry_name,
};
```

- [ ] **Step 6: Run package tests**

```bash
cd src-tauri
cargo test export::templates::package::tests
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/export/templates/package src-tauri/src/export/templates/package.rs
git commit -m "refactor(export): extract template package library"
```

---

### Task 6: Extract Editor File Operations

**Files:**
- Create: `src-tauri/src/export/templates/package/editor.rs`
- Modify: `src-tauri/src/export/templates/package/mod.rs`
- Modify: `src-tauri/src/export/templates/package/storage.rs`

**Interfaces:**
- Consumes: `library::resolve_package`, `storage::is_text_name`, manifest file safety.
- Produces:

```rust
pub(super) fn read_package_file(
    app: &tauri::AppHandle,
    id: String,
    file: String
) -> Result<String, String>

pub(super) fn write_package_file(
    app: &tauri::AppHandle,
    id: String,
    file: String,
    text: String
) -> Result<(), String>
```

- [ ] **Step 1: Run editor-facing package tests and probe**

```bash
cd src-tauri
cargo test export::templates::package::tests
npm run probe -- test/probes/export-template-ui.js
```

Expected: PASS.

- [ ] **Step 2: Move editor operations**

Move `read_template_file` and `write_template_file` to `editor.rs`, renaming the internal names to
`read_package_file` and `write_package_file`. Keep the facade's existing public names:

```rust
pub use editor::{read_package_file as read_template_file,
                write_package_file as write_template_file};
```

Preserve the `template.json` write refusal and every atomic-write error.

Use this header:

```rust
//! The template code panel's file contract: editable text files, read-only binaries and atomic save.
//!
//! May import: std, the package resolver, storage classification and the atomic file seam. Upholds:
//! the app-owned manifest is never writable from the editor and no path leaves the package.
```

- [ ] **Step 3: Run focused tests and probe again**

```bash
cd src-tauri
cargo test export::templates::package::tests
cd ..
npm run probe -- test/probes/export-template-ui.js
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/export/templates/package
git commit -m "refactor(export): extract template editor file access"
```

---

### Task 7: Extract Alias Staging and Import Coordination

**Files:**
- Create: `src-tauri/src/export/templates/package/alias.rs`
- Create: `src-tauri/src/export/templates/package/import.rs`
- Create: `src-tauri/src/export/templates/package/tests.rs`
- Modify: `src-tauri/src/export/templates/package/mod.rs`

**Interfaces:**
- Consumes: `scan`, `library`, `storage`, manifest rules and the atomic file seam.
- Produces:
  - `alias::alias_names`, `alias::stage_alias`
  - `import::inspect_template`, `import::wrapper_preview`, `import::import_template`,
    `import::create_default`, `import::update_details`

- [ ] **Step 1: Run import, details and alias tests**

```bash
cd src-tauri
cargo test export::templates::package::tests
npm run probe -- test/probes/export-template-import.js
npm run probe -- test/probes/export-template-output.js
```

Expected: PASS.

- [ ] **Step 2: Extract aliases**

Move `alias_names`, `stage_alias` and all three `link_directory` cfg variants. Leave
`collect_files` in `storage.rs`, where it serves `package_files`.

Use this header:

```rust
//! Export-time staging of a package under the basename its relative template links expect.
//!
//! May import: std and manifest alias rules. Upholds: staging is temporary, platform-specific links
//! are safe and the stored package remains under its canonical id.
```

- [ ] **Step 3: Extract import and mutation**

Move:

```text
inspect_template
wrapper_preview
import_template
build_package
create_default
update_details
```

Use this header:

```rust
//! Creating and changing packages: staged import, Pandoc-default factories and details updates.
//!
//! May import: std, tauri, scan, manifest, library and storage. Upholds: a package appears only
//! after complete staged construction and every mutation validates the resulting entry.
```

Keep public signatures and validation order unchanged.

- [ ] **Step 4: Move package tests**

Replace the inline tests with:

```rust
#[cfg(test)]
mod tests;
```

Move the four existing tests unchanged into `package/tests.rs`, grouped as:

```text
Storage and naming
Editor classification
```

- [ ] **Step 5: Verify module sizes and focused behavior**

```bash
wc -l src-tauri/src/export/templates/package/*.rs
cd src-tauri
cargo test export::templates::package::tests
```

Expected: every package file is below roughly 450 lines and tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/export/templates/package
git commit -m "refactor(export): split template import and alias logic"
```

---

### Task 8: Update Architecture Notes and Run Complete Verification

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/ai-context.md`
- Modify: `test/README.md` only if a check or probe list changes

**Interfaces:**
- Consumes: final module layout from Tasks 1–7.
- Produces: documentation that names the facades and extracted responsibilities; no runtime change.

- [ ] **Step 1: Update architecture paths**

In `docs/architecture.md`, replace the `scan.rs`/`package.rs` shorthand with the directory facades and
name the extracted responsibilities:

```text
templates/scan/{mod,source,archive,detection,wrapper}.rs
templates/package/{mod,import,library,editor,alias,storage}.rs
```

State that `mod.rs` preserves the stable caller-facing boundary.

- [ ] **Step 2: Update agent context**

In `docs/ai-context.md`, update import and package descriptions to point at:

```text
scan/archive.rs       ZIP safety
scan/detection.rs     entry and kind detection
scan/source.rs        source listing and copies
scan/wrapper.rs       wrapper conversion
package/import.rs     lifecycle creation and mutation
package/library.rs    discovery and resolution
package/editor.rs     code-panel file access
package/alias.rs      export-time alias staging
package/storage.rs    paths and names
```

Do not change the user-facing feature rules or CSL precedence text.

- [ ] **Step 3: Run Rust formatting on changed files**

Run `rustfmt` in check mode only on changed Rust files:

```bash
git diff --name-only -- 'src-tauri/**/*.rs' | xargs rustfmt --edition 2024 --check
```

Do not reformat unrelated Rust files.

Expected: changed Rust files are formatted; unrelated files are untouched.

- [ ] **Step 4: Run the complete Rust suite**

```bash
cd src-tauri
cargo test
```

Expected: 135 tests pass, 0 fail.

- [ ] **Step 5: Run pure checks and production build**

```bash
cd ..
npm run check
npm run build
```

Expected: 60/60 checks pass and the build succeeds.

- [ ] **Step 6: Run the full Tauri suite**

```bash
npm run probe:all
```

Expected: 203 probes pass, 29 skip.

- [ ] **Step 7: Inspect final module sizes and diff**

```bash
find src-tauri/src/export/templates/scan src-tauri/src/export/templates/package \
  -name '*.rs' -print0 | xargs -0 wc -l | sort -nr
git diff --check
git status --short --branch
git diff --stat
```

Expected: no file in the refactored cluster above roughly 450 lines, no whitespace errors, and
only refactor/docs changes.

- [ ] **Step 8: Commit**

```bash
git add docs/architecture.md docs/ai-context.md src-tauri/src/export/templates
git commit -m "docs(export): record template module boundaries"
```
