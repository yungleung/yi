# Export templates as packages

## Problem

Every pandoc export already reads a defaults YAML file that the reader may edit, and the export card
shows where that file is. What is missing is the other half of a journal submission: the
**template** the note is poured into. Pandoc takes a text template (`--template`) for HTML, LaTeX,
PDF and EPUB, and a reference document (`--reference-doc`) for Word and OpenDocument. Readers get
those files from three places:

- the template pandoc ships, as a starting point;
- a file or folder of their own;
- a journal's author kit, usually a folder of several files — a main `.tex` beside a `.cls`, a
  `.bst`, sometimes figures — or a `.docx` reference document.

A single file picker cannot carry that. A LaTeX kit that names `\documentclass{journal}` fails with
only the `.tex` copied; a journal `.docx` is a binary the app should not try to edit; and a kit
downloaded last week may move or disappear.

The purpose of editing YAML and TeX here is this feature, not a general source-file editor. A
template is an **export resource** with its own lifecycle, not a note: it does not belong in the
workspace tree, the document stack, or the wikilink index.

## Goals

- Import a template from one file, a folder, or a zip, and turn it into a stable package in the
  app's export data.
- Create a package from pandoc's own default template or reference document.
- Choose a package per export kind and remember the choice.
- Edit the package's text files in the app, with YAML/LaTeX highlighting, and validate the package
  with pandoc before it is used.
- Hand pandoc the template, reference document, CSL style, assets and resource paths it needs.
- Record where a package came from and under what licence, without making the reader write a
  manifest by hand.
- Keep the markdown editor out of it: no block model, no source mode, no session questions.

## Non-goals

- General `.yaml`/`.tex` editing as workspace documents. That would need the editor-core split and
  is a separate decision.
- Downloading templates from journal sites. The reader downloads the kit; the app imports it.
- Editing binary reference documents (`.docx`, `.odt`). They are chosen and used, not edited.
- Installing TeX classes or packages with `tlmgr`, or running unrestricted shell escape.
- Automatically rewriting an arbitrary journal example into a perfect pandoc template. The app
  offers one explicit, previewable wrapper conversion; the rest stays the reader's text.

## The package

A package is a folder under the app's export data:

```text
<app data>/export/templates/<id>/
  template.json          the app's manifest
  main.tex               the entry (or journal.docx for a reference-doc kind)
  journal.cls            assets, kept beside it
  journal.bst
```

`<id>` is a slug of the display name, made unique with `-2`, `-3`, … on collision. The manifest is
**written by the app**; the reader never has to create one.

`template.json` rather than YAML is deliberate: the manifest is app metadata and nothing pandoc
reads. JSON needs no second YAML schema in Rust (`serde_json` is already a dependency), while the
files pandoc actually consumes — defaults and templates — stay in their own formats.

```json
{
  "schema": 1,
  "id": "journal-x-latex",
  "name": "Journal X — LaTeX submission",
  "kind": "latex",
  "mode": "template",
  "origin": {
    "type": "folder",
    "path": "/Users/reader/Downloads/journal-x",
    "source": "https://journal.example/author-kit",
    "license": "CC BY 4.0",
    "imported": "2026-10-19"
  },
  "template": "main.tex",
  "reference_doc": null,
  "csl": "journal.csl",
  "assets": ["journal.cls", "journal.bst"],
  "deliver": ["journal.cls", "journal.bst"]
}
```

- `kind` is one of the export kinds the package is for: `html`, `latex`, `pdf`, `epub`, `docx`,
  `odt`. A package belongs to one kind; the same files may be duplicated for another.
- `mode` is `template` (the entry contains `$body$`), `wrapper` (the entry is a complete document
  with a body placeholder inserted) or `reference-doc` (the entry is a binary reference document).
- Exactly one of `template` and `reference_doc` is non-null, and it must match `mode` and the kind.
- `assets` are every other file in the package. `deliver` is the subset copied beside a `.tex`
  output for the LaTeX kind, so the reader's own compile finds the class and bibliography style.
- `origin.path` is kept for provenance only; the package no longer depends on that path.
- `schema` is refused when it is newer than the app knows, with a message naming the version.

The manifest is edited through a details form (name, kind, source, licence, entry file). A raw view
is available in the package editor, but it is not the normal path.

## Import

### Inspection, then confirmation

The reader uses the native dialog to choose a file, folder or zip. The backend first **inspects**
without copying, and returns a proposal:

```rust
pub struct ImportProposal {
    pub kind: TemplateKind,          // template | reference-doc | ambiguous
    pub entry: String,
    pub mode: TemplateMode,          // template | wrapper | reference-doc
    pub assets: Vec<String>,
    pub deliver: Vec<String>,
    pub warnings: Vec<String>,       // e.g. "no $body$; a document with \begin{document}"
}
```

The UI shows the proposal with editable name/kind/source/licence and a package file list. Import
copies the staged files into `export/templates/<id>/`, writes the manifest, and validates when the
reader asks.

### Detection rules

Single file:

- `.tex` and `.html` → a text template (an HTML file may serve the HTML or EPUB kind).
- `.docx`, `.odt` → a reference document.
- `.csl` → a citation style for a package that also has an entry; a lone `.csl` is refused with
  "a style is part of a template package, not a template".
- `.yaml`/`.yml` → a pandoc defaults file; imported as a package override only when the reader
  chooses "this is a defaults file".

Folder or zip:

- walk recursively, ignoring dot-entries; keep every regular file;
- choose the main `.tex` by, in order: contains `$body$`; contains `\begin{document}` and
  `\end{document}`; is named `main.tex`/`template.tex`/`article.tex`; otherwise the largest `.tex`;
- a main `.tex` without `$body$` but with a document environment proposes `mode: wrapper`;
- a `.docx`/`.odt` with no `.tex` proposes a reference-doc package;
- a `.csl` becomes `csl`; `.cls`, `.sty`, `.bst`, `.bbx`, `.cbx` and everything else become assets;
- if two or more candidates are equally plausible, the UI asks which file is the entry.

Zip safety: extract into a staging folder under the app data, reject absolute paths and `..`,
reject symlinks, and stop at 2,000 files / 200 MB. The staging folder is removed after import or
failure. A single top-level folder in the zip is not duplicated in the package id.

### Create from pandoc's default

This is the same package shape with another factory:

- text kinds: run `pandoc --print-default-template=<format>` into the entry file;
- `docx`/`odt`: run `pandoc --print-default-data-file=reference.docx` (or `.odt`) into the entry;
- write a manifest with `origin.type = "pandoc-default"`, `mode` from the file, no assets;
- open the editor on the generated entry.

If pandoc is not available, the action is disabled with the same explanation the export card uses.
The generated template is pandoc's own, with `$body$`; it is editable and duplicated like any other.

### Wrapper conversion

For a main `.tex` with no `$body$`:

1. keep the original as `source.tex` (an asset);
2. write `template.tex` as a copy with `$body$` inserted immediately before `\end{document}`;
3. if the sample has an obvious `\title{...}` / `\author{...}`, offer to replace their contents
   with `$title$` / `$author$` — unchecked by default;
4. record `mode: wrapper`, `entry: template.tex`;
5. preview the result in the editor before saving the package.

Nothing is inferred silently: the proposal says exactly which file was copied, where the body was
inserted, and what was not mapped.

## Export plumbing

### Selection

`AppConfig` gains a defaulted map:

```rust
pub export_templates: BTreeMap<String, String>, // kind -> package id
```

An absent kind means "no template": pandoc's default, as today. The export card's new **Template**
row shows the selected package or "Pandoc's default", with **Choose…**, **Create…** and **Edit…**.
The choice is remembered per kind; changing it in the card changes it for later exports too.

`ExportRequest` gains `template_id: Option<String>`. Rust resolves it under the app's export
directory; it never trusts a path from the webview.

### Arguments

`ExportKind` gains a `template_mode` field: `text`, `reference-doc` or `none`. `pandoc_arguments`
then adds, when a package is selected:

- `--template <package>/<template>` for `text`;
- `--reference-doc <package>/<reference_doc>` for `reference-doc`;
- `--csl <package>/<csl>` when the package carries a style, after the reader's own CSL argument so
  it wins for this export;
- `--resource-path <package>:<existing paths>`.

The PDF run must also see the package directory as its working directory (or through `TEXINPUTS`)
so `\documentclass{journal}` and `\usepackage{...}` resolve. The LaTeX export copies the whole asset
tree beside the output `.tex`, not only `deliver`: a figure or data file the template names is as
necessary as its class. HTML is made whole first: the package is staged under the folder name its
template uses in relative links (a folder imported as `template/` keeps that name), added to the
resource path, and a self-contained page embeds its local CSS, JavaScript and pictures. If the
reader's settings leave the page self-contained off, the same asset tree is copied under every
relative prefix the finished page names. EPUB is a container, so its packer rewrites local chapter
links to `assets/…`, adds the package's CSS/JavaScript/images/fonts there, and declares them in
`content.opf`. DOCX, ODT and PDF embed what the converter read and need no sidecars.

The `markdown` kind has no template: its "conversion" is the app's own pre-process.

## Editor

A dedicated **code editor panel**, not the markdown editor. CodeMirror 6 with line numbers, search,
undo, bracket matching and the app theme:

- YAML and TeX syntax come from `@codemirror/legacy-modes` (`yaml`, `stex`) through
  `StreamLanguage`; no markdown pipeline is imported.
- The panel lists the package's text files; binaries (`.docx`, images) are shown as read-only
  entries with their sizes and an "Open in system" action.
- `Cmd/Ctrl+S` writes atomically; a dirty marker and a "Discard" confirmation protect unsaved text.
- **Validate** runs pandoc against a tiny fixture with the package and shows stderr; a second
  "Test PDF" action runs the PDF engine for packages of that kind.
- The same panel edits the kind's defaults YAML, replacing the export card's "reveal in the system"
  button with **Edit defaults**. The defaults file is not a package; it stays where it is.

The panel is a modal/side surface owned by the export UI. It is not a session document: no stack, no
"Push and Open", no workspace tree entry, no autosave into the reader's notes.

## Validation and trust

- Validation runs pandoc on a one-paragraph fixture into a temp output. It checks the manifest's
  entry exists, then reports pandoc's own sentence. Missing `\documentclass` files, bad YAML and
  unknown template variables are pandoc's or the engine's errors, not ones the app invents.
- PDF validation runs the configured engine once, with the package folder as the working directory
  and restricted shell escape. It is explicit and may take seconds; it is not part of every export.
- Import shows one trust notice: a template is code for the converter, and the PDF engine will
  process it. The app runs neither TeX's unrestricted shell escape nor `tlmgr`.
- `origin.source` and `origin.license` are displayed on the package card and kept in the manifest.
  The reader is responsible for the licence of a journal kit; the app only records what it was told.

## Modules

Rust, under the existing export domain:

```text
src-tauri/src/export/templates/
  mod.rs        commands and the public TemplateSummary/ImportProposal types
  manifest.rs   TemplateManifest, schema check, id/slug, atomic read/write
  scan.rs       file/folder/zip inspection, entry detection, wrapper proposal
  package.rs    staging, copy, asset/deliver lists, duplicate/remove
  validate.rs   pandoc dry run and PDF test
```

`export/mod.rs` declares `mod templates;` and re-exports the commands; `lib.rs` registers them.
`kinds.rs` gains `template_mode`; `run.rs` resolves and passes the package.

TypeScript:

```text
src/api/templates.ts                 invoke wrappers and types
src/ui/export/templates/library.ts   package cards: choose, create, import, duplicate, remove
src/ui/export/templates/editor.ts    CodeMirror panel and file list
src/ui/export/templates/details.ts   name/kind/source/licence/entry form
src/ui/export/export_dialog.ts       the Template row and the defaults "Edit" action
```

Config types and defaults gain `export_templates` in `src/api/settings.ts` and
`src-tauri/src/settings.rs`.

## Testing

- Rust unit tests: slug/id collisions, manifest round trip, schema refusal, entry detection
  (template/wrapper/reference-doc/ambiguous), zip-slip and limits, delivery list, argument assembly
  with and without a package.
- Node checks: the manifest shape agreed by Rust and the TS types (a small generated fixture).
- Probes: import a fixture package, create from pandoc's default, edit and save a file, validate a
  broken package (the message names the missing file), export HTML/LaTeX/DOCX with a package and
  find its marker in the output, and confirm the package never appears in the session stack.
- Fixtures under `test/fixtures/templates/`: a small HTML template with a marker, a LaTeX main
  template, a wrapper with `\begin{document}`, a fake `.cls`, a reference `.docx`, and a zip built
  by the probe from these.

## Work order

1. **Package model and import** — manifest, scan/detection, staging, duplicate/remove, Rust tests.
2. **Export plumbing** — kind template modes, config selection, argument assembly, a probe that a
   custom template changes the output.
3. **UI** — Template row, library, import proposal, create-from-pandoc-default.
4. **Editor** — CodeMirror panel, file list, defaults editing, validate/test PDF.
5. **Journal refinements** — wrapper conversion, delivery of class/bst files, provenance/licence
   display.

Steps 1–2 are useful without any new UI: a reader can put a package in place and set the config.
Steps 3–5 are the product surface.
