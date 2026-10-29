# Presentation Exports and Rho Callouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Reveal.js and Beamer as template-free export kinds, give New Markdown built-in presentation metadata starters, publish root-level examples separate from test fixtures, and lower Rho Class's Note and Information callouts through its package filter.

**Architecture:** The Rust `KINDS` table remains the one export-kind registry. Beamer joins the shared LaTeX rewrite family; Reveal.js gets a dedicated bundle writer that can retain remote resources or download them locally. Built-in new-note metadata choices live in the app, not in the export-template library. `examples/` is user-facing documentation, while `test/fixtures/` remains controlled test data.

**Tech Stack:** Rust/Tauri, TypeScript, Pandoc 3.12, XeLaTeX/pdfLaTeX, Reveal.js 6, Lua filters, YAML frontmatter, Node checks, Tauri MCP probes.

**Spec:** `docs/superpowers/specs/2026-10-29-presentation-exports-and-rho-callouts-design.md`

## Global Constraints

- Reveal.js and Beamer have `KindTemplate::None`; no template package can target them.
- Both kinds configure presentation behavior through note frontmatter and Pandoc document attributes.
- Reveal.js always exports a non-self-contained folder bundle.
- Reveal.js's two resource choices are independent checkboxes, both off by default.
- Local Reveal.js mode downloads every required Reveal.js asset into `js/dist/`.
- Local picture mode downloads every remote picture into `images/`; remote mode preserves URLs.
- Beamer writes one PDF through XeLaTeX and takes no template or card page-size controls.
- `examples/` is user-facing reference material and application behavior must never depend on it.
- `test/fixtures/` remains independently controlled test data.
- The Rho source package's upstream class files remain unchanged.
- Tests follow red-green: write the failing check/probe, run it, implement, run it again.
- Every task ends with focused checks and a commit.

## File Structure

**Moved examples**

- Move: `test/fixtures/templates/examples/` → `examples/templates/`
- Create: `examples/revealjs.md`
- Create: `examples/beamer.md`

**Rho Class**

- Modify: `examples/templates/rho-class/example.md`
- Modify: `examples/templates/rho-class/callout.lua`
- Modify: `examples/templates/rho-class/template.tex`
- Modify: `examples/templates/rho-class/README.md`

**Export vocabulary and defaults**

- Modify: `src-tauri/src/export/kinds.rs`
- Create: `src-tauri/assets/export/export.revealjs.yaml`
- Create: `src-tauri/assets/export/export.beamer.yaml`
- Modify: `src-tauri/src/export/info.rs`
- Modify: `src-tauri/src/export/run/mod.rs`
- Modify: `src-tauri/src/export/run/arguments.rs`
- Modify: `src-tauri/src/export/config.rs`
- Modify: `src-tauri/src/export/font_hints.rs`
- Modify: `src-tauri/src/lib.rs`

**Reveal.js bundle**

- Create: `src-tauri/src/export/revealjs.rs`
- Modify: `src-tauri/src/export/html_media.rs`
- Modify: `src-tauri/src/export/pictures.rs`
- Modify: `src-tauri/src/export/run/delivery.rs`
- Modify: `src/api/export.ts`
- Modify: `src/ui/export/export_dialog.ts`
- Modify: `src/ui/export/export_flow.ts`

**Export UI and rewriting**

- Modify: `src/ui/export/templates/kind_label.ts`
- Create: `src/ui/export/kind_family.ts`
- Modify: `src/ui/export/preprocess.ts`
- Modify: `src/ui/export/equation_rewrites.ts`
- Modify: `src/ui/export/table_rewrites.ts`
- Modify: `src/ui/export/list_rewrites.ts`
- Modify: `src/ui/export/reference_header.ts`
- Modify: all eight `locales/*.json`

**New-note starters**

- Modify: `src/services/new_document_templates.ts`
- Modify: `src/ui/new_document/new_document_dialog.ts`
- Modify: `src/ui/new_document/template_picker.ts`

**Tests and docs**

- Modify: `src-tauri/src/export/tests/kinds.rs`
- Modify: `src-tauri/src/export/tests/run/arguments.rs`
- Create: `src-tauri/src/export/tests/revealjs.rs`
- Modify: `test/checks/check-template-examples.mjs`
- Modify: `test/checks/check-new-document.mjs`
- Create: `test/checks/check-export-families.mjs`
- Create: `test/probes/export-revealjs.js`
- Create: `test/probes/export-beamer.js`
- Modify: `test/probes/export-kinds.js`
- Modify: `test/probes/export-docx.js`, `test/probes/export-odt.js`, `test/probes/export-latex.js`, `test/probes/export-pdf.js`, and `test/probes/export-markdown.js` only for the added kind list/count
- Modify: `test/probes/new-note-package-metadata.js`
- Modify: `test/probes/new-document.js`
- Modify: `test/README.md`
- Modify: `docs/ai-context.md`
- Modify: `docs/architecture.md`
- Modify: all eight `src/ui/documentation/documentation.*.md`

---

### Task 1: Move the User Examples and Convert Rho Callouts

**Files:**
- Move: `test/fixtures/templates/examples/` → `examples/templates/`
- Modify: `test/checks/check-template-examples.mjs`
- Modify: `test/probes/template-examples.js`
- Modify: `examples/templates/rho-class/example.md`
- Modify: `examples/templates/rho-class/callout.lua`
- Modify: `examples/templates/rho-class/template.tex`
- Modify: `examples/templates/rho-class/README.md`

**Interfaces:**
- Consumes: Yi's semantic callout export shape:
  `.callout`, `.callout-note`, `.callout-info`, and `.callout-title`.
- Produces: a compile-tested Rho package whose filter lowers Note and Information
  callouts to `note` and `info` LaTeX environments.

- [ ] **Step 1: Update the example-path check first**

Change the example root constant in `test/checks/check-template-examples.mjs`:

```js
const examplesRoot = join(repositoryRoot, 'examples', 'templates');
```

Use `examplesRoot` for every existing package path and expected file.

- [ ] **Step 2: Run the path check to verify RED**

Run:

```bash
node test/checks/check-template-examples.mjs
```

Expected: FAIL because `examples/templates/html` and the other packages do
not exist yet.

- [ ] **Step 3: Move the examples out of fixtures**

Run:

```bash
mkdir -p examples
git mv test/fixtures/templates/examples examples/templates
```

Update every repository reference from
`test/fixtures/templates/examples` to `examples/templates`.

- [ ] **Step 4: Add the failing Rho callout contract**

In `test/checks/check-template-examples.mjs`, replace the old
`!/^:::/m.test(example)` condition with checks equivalent to:

```js
check(
  'rho-class: the example uses Note and Information callouts',
  /::: \{\.callout \.callout-note\}/m.test(example) &&
    /::: \{\.callout \.callout-info title="Information"\}/m.test(example) &&
    !/^> \*\*Calibration assumption\.\*\*/m.test(example)
);
```

Also require the filter source to contain both mappings:

```js
check(
  'rho-class: the filter maps semantic callouts to Rho environments',
  /callout-note/.test(calloutFilter) &&
    /callout-info/.test(calloutFilter) &&
    /RawBlock/.test(calloutFilter)
);
```

Run:

```bash
node test/checks/check-template-examples.mjs
```

Expected: FAIL because the example still uses a blockquote and the filter
still emits a generic Div.

- [ ] **Step 5: Convert the Rho example**

Replace the Calibration assumption blockquote with:

```markdown
::: {.callout .callout-note}
Shared drifts are treated as common-mode signal. A detector whose drift
departs from the array median is excluded before the sky model is fitted,
and that exclusion is recorded in the result.
:::
```

In “Rho Custom Packages,” add:

```markdown
::: {.callout .callout-info title="Information"}
Rho's `info` environment is for reference material that helps the reader
interpret a method without interrupting the main argument.
:::
```

- [ ] **Step 6: Implement the Rho filter**

Use a filter shaped like:

```lua
local environments = {
  ["callout-note"] = "note",
  ["callout-info"] = "info",
}

local function callout_environment(div)
  local environment = nil
  for class, name in pairs(environments) do
    if div.classes:includes(class) then
      environment = name
      break
    end
  end
  if environment == nil then
    return nil
  end

  local blocks = pandoc.List()
  blocks:insert(pandoc.RawBlock("latex", "\\begin{" .. environment .. "}"))
  for _, block in ipairs(div.content) do
    local title = block.t == "Div" and block.classes:includes("callout-title")
    if not title then
      blocks:insert(block)
    end
  end
  blocks:insert(pandoc.RawBlock("latex", "\\end{" .. environment .. "}"))
  return blocks
end

function Div(div)
  return callout_environment(div) or div
end
```

Remove the quote-to-note override from `template.tex`:

```tex
\renewenvironment{quote}{\begin{note}}{\end{note}}
```

Ordinary blockquotes now use Pandoc's normal quote environment.

- [ ] **Step 7: Run focused Rho checks**

Run:

```bash
node test/checks/check-template-examples.mjs
npm run check
```

Expected: all checks pass, including the real Rho PDF compilation.

- [ ] **Step 8: Commit Task 1**

```bash
git add examples test/checks/check-template-examples.mjs test/probes/template-examples.js docs
git commit -m "docs(examples): move references and add rho callouts"
```

---

### Task 2: Add Reveal.js and Beamer to the Export Kind Registry

**Files:**
- Modify: `src-tauri/src/export/kinds.rs`
- Create: `src-tauri/assets/export/export.revealjs.yaml`
- Create: `src-tauri/assets/export/export.beamer.yaml`
- Modify: `src-tauri/src/export/tests/kinds.rs`
- Modify: `src/api/export.ts`
- Modify: `src/ui/export/templates/kind_label.ts`
- Modify: all eight `locales/*.json`
- Modify: `test/probes/export-kinds.js`

**Interfaces:**
- Produces: `KINDS` rows named `revealjs` and `beamer`.
- Produces: `KindTemplate::None` for both.
- Produces: localized `export.kind.revealjs` and `export.kind.beamer`.

- [ ] **Step 1: Write failing Rust kind tests**

Extend `src-tauri/src/export/tests/kinds.rs`:

```rust
#[test]
fn presentation_kinds_use_pandoc_without_template_packages() {
    for name in ["revealjs", "beamer"] {
        let kind = kind_of(name).expect("presentation kind");
        assert!(kind.needs_pandoc);
        assert_eq!(kind.template_mode, KindTemplate::None);
    }
    assert_eq!(kind_of("revealjs").unwrap().extension, "html");
    assert_eq!(kind_of("beamer").unwrap().extension, "pdf");
}
```

Add both writers to the producer map:

```rust
"revealjs" => "html",
"beamer" => "pdf",
```

- [ ] **Step 2: Verify RED**

Run:

```bash
cargo test export::tests::kinds
```

Expected: FAIL because `kind_of("revealjs")` and `kind_of("beamer")`
return the no-such-kind error.

- [ ] **Step 3: Add the kind rows**

Add `revealjs` immediately after `html` and `beamer` after `pdf`, using:

```rust
ExportKind {
    kind: "revealjs",
    extension: "html",
    name_suffix: "",
    takes_a_title: false,
    needs_a_language: false,
    names_its_body: false,
    carries_pictures: true,
    takes_a_page_size: false,
    needs_pandoc: true,
    needs_a_font: false,
    defaults: include_str!("../../assets/export/export.revealjs.yaml"),
    ships_fonts: false,
    template_mode: KindTemplate::None,
},
```

```rust
ExportKind {
    kind: "beamer",
    extension: "pdf",
    name_suffix: "",
    takes_a_title: false,
    needs_a_language: false,
    names_its_body: false,
    carries_pictures: false,
    takes_a_page_size: false,
    needs_pandoc: true,
    needs_a_font: true,
    defaults: include_str!("../../assets/export/export.beamer.yaml"),
    ships_fonts: false,
    template_mode: KindTemplate::None,
},
```

- [ ] **Step 4: Add the defaults files**

`export.revealjs.yaml` must include:

```yaml
reader: markdown
writer: revealjs
standalone: true
embed-resources: false
slide-level: 2
incremental: false
controls: true
progress: true
history: true
variables: {}
metadata-files: []
include-before-body: []
include-after-body: []
include-in-header: []
bibliography: []
filters:
- type: citeproc
shift-heading-level-by: 0
highlight-style: pygments
fail-if-warnings: false
```

`export.beamer.yaml` must include:

```yaml
reader: markdown
writer: beamer
standalone: true
pdf-engine: xelatex
slide-level: 2
variables: {}
metadata-files: []
include-before-body: []
include-after-body: []
include-in-header: []
bibliography: []
filters:
- type: citeproc
shift-heading-level-by: 0
highlight-style: pygments
fail-if-warnings: false
```

- [ ] **Step 5: Add labels in every locale**

Add:

```json
"export.kind.revealjs": "Reveal.js presentation (.html)",
"export.kind.beamer": "Beamer presentation (.pdf)",
```

Translate both values in every shipped locale.

Extend `kindLabel`:

```ts
case 'revealjs':
  return t('export.kind.revealjs');
case 'beamer':
  return t('export.kind.beamer');
```

Do not add either kind to `TEMPLATE_KINDS`.

- [ ] **Step 6: Verify the kind UI**

Extend `test/probes/export-kinds.js` with both localized menu labels.
Reveal.js's bundle target is asserted in Task 4 after its output helper
exists; Beamer's `.pdf` target is asserted here.

Run:

```bash
cargo test export::tests::kinds
npm run check
npm run probe -- test/probes/export-kinds.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src-tauri/src/export/kinds.rs src-tauri/src/export/tests/kinds.rs src-tauri/assets/export src/api/export.ts src/ui/export/templates/kind_label.ts locales test/probes/export-kinds.js
git commit -m "feat(export): register presentation kinds"
```

---

### Task 3: Put Beamer in the LaTeX Export Family

**Files:**
- Create: `src/ui/export/kind_family.ts`
- Modify: `src/ui/export/preprocess.ts`
- Modify: `src/ui/export/equation_rewrites.ts`
- Modify: `src/ui/export/table_rewrites.ts`
- Modify: `src/ui/export/list_rewrites.ts`
- Modify: `src/ui/export/export_flow.ts`
- Modify: `src-tauri/src/export/tests/run/arguments.rs`
- Create: `test/probes/export-beamer.js`

**Interfaces:**
- Produces:
  `isLatexKind(kind: string): boolean` and
  `isHtmlLikeKind(kind: string): boolean`.
- Consumes: the existing counter-backed table, list, equation, and reference
  rewrites.

- [ ] **Step 1: Add a failing Node family check**

Create assertions in `test/checks/check-completions.mjs` only if its
shared bundling already imports export modules; otherwise create
`test/checks/check-export-families.mjs` with:

```js
check('Beamer is a LaTeX kind', isLatexKind('beamer'), true);
check('PDF is a LaTeX kind', isLatexKind('pdf'), true);
check('Reveal.js is HTML-like', isHtmlLikeKind('revealjs'), true);
check('DOCX is neither', isLatexKind('docx'), false);
```

Run the check. Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement the family module**

```ts
const LATEX_KINDS = new Set(['latex', 'pdf', 'beamer']);
const HTML_LIKE_KINDS = new Set(['html', 'epub', 'revealjs']);

export function isLatexKind(kind: string): boolean {
  return LATEX_KINDS.has(kind);
}

export function isHtmlLikeKind(kind: string): boolean {
  return HTML_LIKE_KINDS.has(kind);
}
```

Replace every `kind === 'latex' || kind === 'pdf'` in the export rewrite
modules with `isLatexKind(kind)`.

Replace HTML-specific source-rewrite checks with `isHtmlLikeKind(kind)`
where the behavior is truly HTML-like, not where it is HTML-bundle-only.

- [ ] **Step 3: Include Beamer's generated reference header**

In `export_flow.ts`:

```ts
reference_header: isLatexKind(first.kind) ? referenceHeader(text) : ''
```

Keep native-BibTeX package filtering limited to the `latex` package kind:

```ts
if (kind !== 'latex' || templateId === null) {
  return null;
}
```

- [ ] **Step 4: Write the failing Beamer export probe**

Create `test/probes/export-beamer.js` using a temporary workspace and real
Pandoc. The note starts:

```markdown
---
title: Beamer Probe
subtitle: A presentation export
author: Yi
date: 2026-10-29
theme: Madrid
colortheme: seahorse
aspectratio: 169
slide-level: 2
---

# Section

## First frame

A formula and a citation [@smith2020].
```

Export through the app to `deck.pdf`, wait for the success hint, then check:

- the file exists and starts with `%PDF-`;
- Ghostscript text includes `First frame`;
- Pandoc stderr has no LaTeX error;
- no Template row appears in the card;
- no page-size control appears.

Run:

```bash
npm run probe -- test/probes/export-beamer.js
```

Expected: FAIL because Beamer is not yet treated as LaTeX by source
preprocessing and the probe cannot produce the intended deck.

- [ ] **Step 5: Verify Beamer**

Run:

```bash
npx tsc --noEmit
npm run check
npm run probe -- test/probes/export-beamer.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/ui/export/kind_family.ts src/ui/export/preprocess.ts src/ui/export/equation_rewrites.ts src/ui/export/table_rewrites.ts src/ui/export/list_rewrites.ts src/ui/export/export_flow.ts test/checks test/probes/export-beamer.js
git commit -m "feat(export): write beamer presentations"
```

---

### Task 4: Implement Reveal.js Bundle Output and Resource Choices

**Files:**
- Create: `src-tauri/src/export/revealjs.rs`
- Modify: `src-tauri/src/export/mod.rs`
- Modify: `src-tauri/src/export/run/mod.rs`
- Modify: `src-tauri/src/export/run/delivery.rs`
- Modify: `src-tauri/src/export/html_media.rs`
- Modify: `src-tauri/src/export/pictures.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/api/export.ts`
- Modify: `src/ui/export/export_dialog.ts`
- Modify: `src/ui/export/export_flow.ts`
- Create: `src-tauri/src/export/tests/revealjs.rs`
- Create: `test/probes/export-revealjs.js`

**Interfaces:**
- Produces: `revealjs_output(requested: &str) -> (bundle: PathBuf, page: PathBuf)`.
- Produces: `download_revealjs_assets(page: &Path, base_url: &str) -> Result<(), String>`.
- Produces: `package_revealjs_images(page: &Path) -> Result<(), String>`.
- `ExportRequest` gains:
  `revealjs_remote_js: bool` and `revealjs_remote_pictures: bool`.
- Both default to `false` in serde and TypeScript.

- [ ] **Step 1: Write failing Rust bundle tests**

In `src-tauri/src/export/tests/revealjs.rs`, use the existing export test
temporary-directory convention rather than a new dependency, then write:

```rust
#[test]
fn revealjs_output_is_a_folder_with_a_named_page() {
    let root = temp_dir("revealjs-output");
    let (bundle, page) = revealjs_output(
        root.join("talk").to_str().unwrap()
    ).unwrap();
    assert_eq!(bundle, root.join("talk"));
    assert_eq!(page, bundle.join("talk.html"));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn revealjs_asset_paths_stay_below_js_dist() {
    assert_eq!(
        reveal_asset_path("js/dist/reveal.js").unwrap(),
        PathBuf::from("js/dist/reveal.js")
    );
    assert!(reveal_asset_path("../secret").is_err());
}
```

Run:

```bash
cargo test export::tests::revealjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement bundle output and local media**

`revealjs_output` mirrors `html_output` but accepts Reveal.js's own target
and always creates `<folder>/<folder-name>.html`.

Refactor `html_media.rs` so the media copier takes a destination subfolder.
For Reveal.js call:

```rust
package_local_media(output, "images")
```

It copies every local image to `images/` and rewrites its URL.

- [ ] **Step 3: Add the remote resource request fields**

TypeScript:

```ts
revealjs_remote_js: boolean;
revealjs_remote_pictures: boolean;
```

Rust:

```rust
#[serde(default)]
pub revealjs_remote_js: bool,
#[serde(default)]
pub revealjs_remote_pictures: bool,
```

- [ ] **Step 4: Add two export-card checkboxes**

Create:

```ts
private readonly remoteRevealjs: HTMLInputElement;
private readonly remotePictures: HTMLInputElement;
```

Rows are visible only when:

```ts
info.kind === 'revealjs'
```

Labels:

```json
"export.remoteRevealjs": "Use remote Reveal.js resources",
"export.remotePictures": "Use remote pictures"
```

Both checkboxes initialize unchecked.

- [ ] **Step 5: Implement picture locality**

In `export_flow.ts`, remote picture policy is:

```ts
const keepPictureRemote =
  first.kind === 'html' ||
  (first.kind === 'revealjs' && answer.revealjsRemotePictures);
```

For a local Reveal.js picture, fetch failure is fatal:

```ts
if (first.kind === 'revealjs' && !keepPictureRemote) {
  throw new Error(t('export.revealPictureFailed', { url }));
}
```

After Pandoc writes the page, the backend copies every local picture into
`images/`.

- [ ] **Step 6: Implement local Reveal.js assets**

When `revealjs_remote_js` is false:

1. Add `--variable revealjs-url=js` to the Pandoc arguments.
2. Read `href` and `src` values from the generated page.
3. Accept only paths beginning `js/dist/`.
4. Fetch the same relative path from the pinned base
   `https://unpkg.com/reveal.js@6.0.1/`.
5. Write the bytes to the same path under the bundle.
6. Refuse traversal and missing downloads.

When `revealjs_remote_js` is true, do not pass `revealjs-url`, and leave
Pandoc's pinned CDN URLs unchanged.

Add a test-only `export_use_revealjs_cdn` command and reset it in
`test/tauri-probe.mjs`, matching the existing Pandoc seam.

- [ ] **Step 7: Make Reveal.js a folder target**

In `export_dialog.ts`, target-folder behavior applies to both:

```ts
const bundleTarget = info.kind === 'html' || info.kind === 'revealjs';
```

Do not show the HTML self-contained checkbox for Reveal.js.

In `run_export`, both kinds use their bundle output helper:

```rust
if kind.kind == "html" || kind.kind == "revealjs" {
    let (_, page) = bundle_output(kind, &request.output_path)?;
    request.output_path = page.to_string_lossy().into_owned();
}
```

- [ ] **Step 8: Write and run the failing Reveal.js probe**

The probe must cover four modes with a local HTTP fixture:

```text
local JS + local pictures
remote JS + local pictures
local JS + remote pictures
remote JS + remote pictures
```

For local modes, assert:

- `deck/deck.html`;
- `deck/images/...`;
- `deck/js/dist/reveal.js`;
- no `unpkg.com` in local-JS mode;
- no `http://127.0.0.1` image URLs in local-picture mode.

For remote modes, assert the corresponding URLs remain.

Perform a real Pandoc export. Use the local fixture base URL for the
download seam.

Run:

```bash
cargo test export::tests::revealjs
npm run check
npm run probe -- test/probes/export-revealjs.js
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```bash
git add src-tauri/src/export/revealjs.rs src-tauri/src/export/mod.rs src-tauri/src/export/run src-tauri/src/export/html_media.rs src-tauri/src/export/pictures.rs src-tauri/src/lib.rs src/api/export.ts src/ui/export/export_dialog.ts src/ui/export/export_flow.ts src-tauri/src/export/tests/revealjs.rs test/tauri-probe.mjs test/probes/export-revealjs.js locales
git commit -m "feat(export): write local revealjs bundles"
```

---

### Task 5: Add Built-In New Note Metadata Starters

**Files:**
- Modify: `src/services/new_document_templates.ts`
- Modify: `src/ui/new_document/new_document_dialog.ts`
- Modify: `src/ui/new_document/template_picker.ts`
- Modify: `test/checks/check-new-document.mjs`
- Modify: `test/probes/new-note-package-metadata.js`
- Modify: `test/probes/new-document.js`
- Modify: `locales/*.json`

**Interfaces:**
- `NewNoteTemplate` gains `source: 'built-in' | 'package'`.
- Built-in ids are exactly:
  `builtin:revealjs` and `builtin:beamer`.
- `newNoteTemplates()` returns built-ins first, then package choices.
- `newNoteMetadata(id)` resolves built-ins locally and packages through the
  existing template command.

- [ ] **Step 1: Write failing pure metadata checks**

Export the built-in map from `new_document_templates.ts` for Node checks:

```ts
export const BUILT_IN_NOTE_METADATA: Readonly<Record<string, string>>;
```

Check:

```js
check(
  'Reveal.js starter sets slide metadata',
  /(^|\n)theme: black\n/.test(BUILT_IN_NOTE_METADATA['builtin:revealjs']) &&
    /(^|\n)slide-level: 2\n/.test(BUILT_IN_NOTE_METADATA['builtin:revealjs'])
);
check(
  'Beamer starter sets slide metadata',
  /(^|\n)theme: default\n/.test(BUILT_IN_NOTE_METADATA['builtin:beamer']) &&
    /(^|\n)aspectratio: 169\n/.test(BUILT_IN_NOTE_METADATA['builtin:beamer'])
);
```

Run:

```bash
node test/checks/check-new-document.mjs
```

Expected: FAIL because the export does not exist.

- [ ] **Step 2: Implement built-in metadata**

Use the exact YAML from the approved spec. Add localized display names:

```json
"newNote.template.revealjs": "Reveal.js presentation",
"newNote.template.beamer": "Beamer presentation"
```

`newNoteTemplates()` returns:

```ts
[
  {
    id: 'builtin:revealjs',
    name: t('newNote.template.revealjs'),
    kind: 'revealjs',
    source: 'built-in'
  },
  {
    id: 'builtin:beamer',
    name: t('newNote.template.beamer'),
    kind: 'beamer',
    source: 'built-in'
  },
  ...packages
]
```

- [ ] **Step 3: Route metadata reads**

```ts
export async function newNoteMetadata(templateId: string): Promise<string> {
  const builtIn = BUILT_IN_NOTE_METADATA[templateId];
  return builtIn ?? await readTemplateFile(templateId, 'metadata.yaml');
}
```

- [ ] **Step 4: Update the probe**

`new-note-package-metadata.js` must:

- see both built-ins before package metadata choices;
- choose Reveal.js and verify required keys plus presentation keys;
- choose Beamer and verify required keys plus presentation keys;
- confirm `date` and `id` are still stamped;
- confirm a package `metadata.yaml` still appears and wins.

Run:

```bash
node test/checks/check-new-document.mjs
npm run probe -- test/probes/new-note-package-metadata.js
npm run probe -- test/probes/new-document.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/services/new_document_templates.ts src/ui/new_document test/checks/check-new-document.mjs test/probes/new-note-package-metadata.js test/probes/new-document.js locales
git commit -m "feat(new-note): offer presentation metadata starters"
```

---

### Task 6: Add Root Presentation Examples and Update Documentation

**Files:**
- Create: `examples/revealjs.md`
- Create: `examples/beamer.md`
- Modify: `test/checks/check-template-examples.mjs`
- Modify: `test/README.md`
- Modify: `docs/ai-context.md`
- Modify: `docs/architecture.md`
- Modify: `src/ui/documentation/documentation.*.md`

**Interfaces:**
- Consumes: the finished Reveal.js and Beamer export kinds.
- Produces: user-facing examples outside the fixture tree.

- [ ] **Step 1: Add failing example checks**

Extend `check-template-examples.mjs`:

```js
const revealExample = readFileSync(join(repoRoot, 'examples', 'revealjs.md'), 'utf8');
const beamerExample = readFileSync(join(repoRoot, 'examples', 'beamer.md'), 'utf8');

check(
  'revealjs example uses presentation metadata',
  /^slide-level: 2$/m.test(revealExample) &&
    /^transition: /m.test(revealExample) &&
    /^## /m.test(revealExample)
);
check(
  'beamer example uses presentation metadata',
  /^theme: /m.test(beamerExample) &&
    /^aspectratio: /m.test(beamerExample) &&
    /^## /m.test(beamerExample)
);
```

Run the check. Expected: FAIL because both files are absent.

- [ ] **Step 2: Write the Reveal.js example**

Include:

- complete frontmatter;
- section and slide headings;
- speaker notes;
- local and web pictures;
- code, math, table, callout, citation, and cross-reference examples.

Use sections at level 1 and slides at level 2.

- [ ] **Step 3: Write the Beamer example**

Include:

- complete frontmatter with theme, colortheme, fonttheme, aspectratio,
  navigation, and section-titles;
- section and frame headings;
- lists, blocks/callouts, code, math, table, citation, and figure examples.

- [ ] **Step 4: Update all user documentation**

In all eight locales:

- list the new export kinds;
- explain no-template support;
- explain the two Reveal.js remote choices;
- explain reveal bundle layout;
- explain Beamer frontmatter;
- link the root examples;
- state that `examples/` is user reference material and
  `test/fixtures/` is test data.

Update `test/README.md`, `docs/ai-context.md`, and `docs/architecture.md`
with the same structural facts and new probes.

- [ ] **Step 5: Verify the examples**

Run:

```bash
npm run check
npm run probe -- test/probes/export-revealjs.js
npm run probe -- test/probes/export-beamer.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add examples test/checks/check-template-examples.mjs test/README.md docs src/ui/documentation
git commit -m "docs(examples): publish presentation decks"
```

---

### Task 7: Final Integration Verification

**Files:**
- Modify only if a failing check proves an omission.

**Interfaces:**
- Consumes: all preceding tasks.
- Produces: a clean, fully verified branch.

- [ ] **Step 1: Run static and Rust tests**

```bash
npx tsc --noEmit
npm run check
cargo test
```

Expected: all pass.

- [ ] **Step 2: Run every focused probe**

```bash
npm run probe -- test/probes/export-kinds.js
npm run probe -- test/probes/export-revealjs.js
npm run probe -- test/probes/export-beamer.js
npm run probe -- test/probes/new-note-package-metadata.js
npm run probe -- test/probes/new-document.js
npm run probe -- test/probes/template-examples.js
```

Expected: all pass, including real Pandoc, pdfLaTeX, XeLaTeX, and Rho
compilation.

- [ ] **Step 3: Run the complete Tauri sweep**

Restart the app on the branch before the sweep, then run:

```bash
npm run probe:all
```

Expected: all runnable probes pass; only workspace-specific probes skip.

- [ ] **Step 4: Inspect the final tree**

```bash
git status --short
git diff --check
git log --oneline main..HEAD
```

Expected: clean worktree and one reviewable commit per task.

- [ ] **Step 5: Commit any final correction**

If a final correction was required:

```bash
git add -u
git commit -m "fix(export): close presentation export gaps"
```

