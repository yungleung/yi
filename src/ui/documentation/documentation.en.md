---
title: Yi Documentation
id: yi-documentation
lang: en
---

Yi is a local-first markdown editor. A workspace is an ordinary folder, every note is an ordinary
markdown file, and export is a hand-off to Pandoc. This guide explains the parts of the application
you need for daily work, then concentrates on the part that needs the most care: authoring and
sharing export template packages.

You can read this document without changing it. **F1** opens it again, and opening any note replaces
it without asking you to save it.

## Workspace and notes

A workspace is the folder shown in the left-hand tree. Yi reads and writes notes there; there is no
account or remote copy.

- **File → New Markdown** creates a note. Its file name begins as the generated fourteen-digit id,
  and the `title` in its frontmatter is selected so you can type the name immediately.
- The tree's **New file** makes the same kind of note inside the folder you selected.
- **File → Open Folder…** changes the workspace.
- **File → Save** writes the text on screen. Save As stores a copy elsewhere.
- The session stack keeps documents you explicitly pushed there. The tutorial and this guide are
  references: they never enter the stack.

### Frontmatter

Frontmatter is the YAML block at the top of a note:

```yaml
---
title: A note with a name
date: 2026-10-21
id: 20261021153000
keywords:
  - notes
  - export
---
```

`title` names the document. `id` is its stable identity and cannot be changed in the editor. `lang`
can declare the language used by EPUB and other exports. Other keys are available to Pandoc and to
template packages.

**Settings → New note** controls the frontmatter a new note starts from. A template package can
also supply starting metadata for one particular note; that does not remember the template as your
export template.

### Editing

Yi displays rendered markdown while keeping the markdown source authoritative. When the caret
enters a link, formula, fenced block or other source-shaped item, its markdown becomes visible so
you can edit it directly.

Useful commands include:

| Command | Shortcut |
| --- | --- |
| Save | ⌘S or Ctrl+S |
| New Markdown | ⌘N or Ctrl+N |
| Find | ⌘F or Ctrl+F |
| Replace | ⇧⌘F or Ctrl+Shift+F |
| Undo | ⌘Z or Ctrl+Z |
| Documentation | F1 |

## Export a note

**File → Export** offers these kinds:

| Kind | What Yi writes |
| --- | --- |
| HTML | A bundle folder containing a page and its local assets |
| LaTeX | A standalone `.tex` file plus package assets |
| PDF | A PDF produced by a TeX engine |
| EPUB | An EPUB book |
| Word | A `.docx` document |
| LibreOffice | An `.odt` document |
| Markdown | The app's own pre-processed markdown |

Except for Markdown, export needs Pandoc. PDF also needs a TeX distribution and an engine such as
XeLaTeX. Yi finds Pandoc in the usual application locations and on `PATH`; it never installs
software or runs TeX Live Manager for you.

The export card chooses a destination, a template package and, for HTML, whether the page should be
self-contained. The remembered template choice is per export kind, not per note.

### Install Pandoc and TeX

Pandoc is required for HTML, LaTeX, PDF, EPUB, DOCX and ODT exports. A TeX installation is required
only when you want Yi to build a PDF; exporting `.tex` creates the source but does not compile it.

On macOS, install Pandoc and either the full MacTeX distribution or the smaller BasicTeX:

```sh
brew install pandoc
brew install --cask mactex-no-gui
```

On Debian or Ubuntu, install Pandoc and TeX Live with XeLaTeX:

```sh
sudo apt install pandoc texlive-xetex texlive-fonts-recommended
```

On Windows, install Pandoc with WinGet and install either MiKTeX or TeX Live:

```powershell
winget install JohnMacFarlane.Pandoc
winget install MiKTeX.MiKTeX
```

TeX Live is also available as a complete cross-platform installation. Whichever route you choose,
make sure the programs are on the `PATH` used to launch Yi.

Check the installation from a terminal:

```sh
pandoc --version
xelatex --version
```

If `pandoc --version` fails, every Pandoc-backed export is unavailable. If only
`xelatex --version` fails, HTML, LaTeX, EPUB, Word, ODT and Markdown can still work, but PDF cannot.
Yi deliberately does not invoke `tlmgr`: install missing TeX packages with the package manager that
installed TeX.

### Default export settings

Each kind has a reader-editable file such as `export.html.yaml` or `export.pdf.yaml`. The export
card links to it, and the template editor can also edit it. These files are ordinary Pandoc defaults:
writer, PDF engine, highlighting, page variables, filters and resource-path settings all come from
the same Pandoc vocabulary.

## Template packages

A template package is a directory under Yi's export-data folder. It is not a note, never appears in
the workspace tree, and never enters the session stack.

```text
example-latex/
  template.json       Yi's own manifest
  template.tex        the Pandoc text template
  journal.cls         an asset the template may use
  journal.bst         another asset
  metadata.yaml       optional starting frontmatter for a new note
  defaults.yaml       optional Pandoc settings for this package
```

`template.json` is written and maintained by Yi. The reader never supplies it by hand. Its schema is:

```json
{
  "schema": 1,
  "id": "example-latex",
  "name": "Example LaTeX template",
  "kind": "latex",
  "mode": "template",
  "origin": {
    "type": "folder",
    "path": "test/fixtures/templates/examples/latex",
    "source": null,
    "license": "CC0-1.0"
  },
  "template": "template.tex",
  "reference_doc": null,
  "csl": null,
  "assets": ["journal.cls", "journal.bst"],
  "deliver": ["journal.cls", "journal.bst"]
}
```

The important fields are:

- `kind` is one of `html`, `latex`, `pdf`, `epub`, `docx` or `odt`.
- `mode` is `template`, `wrapper` or `reference-doc`.
- A text template uses `template`, while Word and ODT use `reference_doc`; exactly one is present.
- `assets` uses `/`-separated paths relative to the package root.
- `deliver` is the subset copied beside a LaTeX output so the reader's own TeX installation can
  find classes and bibliography styles.
- `origin` records provenance and licence for the reader; the package does not keep using the
  original source path.

### Wrapper mode

Use `mode: "wrapper"` when the file you start from is a **complete LaTeX document**, not a Pandoc
template. A journal sample commonly looks like this:

```tex
\documentclass{journal}
\usepackage{journal}
\begin{document}
\title{A sample paper}
\maketitle
The journal's example prose.
\end{document}
```

It has a preamble and its own document environment, but no `$body$`. Pandoc cannot use it as a
template directly. During import, Yi recognizes that shape and proposes wrapper mode. It keeps the
original sample as a package asset, such as `source.tex`, and writes a new `template.tex` with
`$body$` inserted immediately before `\end{document}`. You may also ask Yi to replace the sample's
`\title{...}` and `\author{...}` with `$title$` and `$author$`; those replacements are optional.

Choose between the three modes by asking what the entry already is:

| Mode | Choose it when | Entry |
| --- | --- | --- |
| `template` | The file is already a Pandoc template and contains `$body$` and any wanted Pandoc variables | The template itself |
| `wrapper` | The file is a complete LaTeX sample with `\begin{document}` and `\end{document}` but no `$body$` | Yi's generated wrapper, with the original sample kept as an asset |
| `reference-doc` | The entry is a binary Word or OpenDocument styled document | `reference.docx` or `reference.odt` |

Wrapper mode preserves the journal sample's document class, packages and front matter. It does not
turn the sample into a polished template automatically: the sample's own prose is still present
unless you edit `template.tex`, and Yi does not infer replacements for arbitrary journal commands.
Use a normal Pandoc **template mode** instead when the kit already provides a template with
`$body$`, or when you can refactor the sample yourself into a clean template.

### Create from Pandoc’s default

**Create…** asks for a name, source and licence, then runs Pandoc to print the default template or
reference document for the selected kind. The new package has the same folder and manifest shape as
an imported package.

- A text kind receives `template.html`, `template.tex` or the format's corresponding text entry.
- Word and ODT receive `reference.docx` and `reference.odt`.
- The manifest records `origin.type: "pandoc-default"`.

The initial package has no optional `metadata.yaml` or `defaults.yaml`. Import a folder that
contains them, or place them in the package root if you are authoring outside Yi. The complete
fixture packages below show both files.

### Import a template kit

Import accepts one file, a folder or a zip. Yi inspects first and copies only after you confirm the
proposal.

For a folder or zip it:

1. walks files recursively and ignores dot-entries;
2. looks for a text entry containing `$body$`;
3. if there is none, looks for a complete document containing `\begin{document}` and
   `\end{document}` and offers a wrapper;
4. treats a lone `.docx` or `.odt` as a reference document;
5. keeps other class, style, bibliography, image, font, CSS and JavaScript files as assets.

A complete LaTeX document without `$body$` can be converted into a wrapper: Yi keeps the original
as an asset and inserts `$body$` immediately before `\end{document}`. Title and author replacements
are optional and never inferred silently.

Zip import rejects absolute paths, `..`, symlinks, oversized archives and archives with too many
files. Extraction happens in a temporary package area that is removed whether import succeeds or
fails.

### Edit and validate

Open a package from the export card or the Template library. The code panel lists editable text files
and read-only binary entries. It provides line numbers, search, undo, YAML/LaTeX highlighting and
atomic saves.

**Validate** converts a one-paragraph fixture through the selected package. **Test PDF** is a second,
explicit action for PDF packages and runs the configured PDF engine. Validation reports Pandoc's or
TeX's own error instead of guessing which package is missing.

## Author HTML templates

An HTML package uses a Pandoc template containing `$body$`:

```html
<!doctype html>
<html lang="$lang$">
  <head>
    <meta charset="utf-8">
    <title>$title$</title>
    <link rel="stylesheet" href="assets/site.css">
  </head>
  <body>
    <main>$body$</main>
    <script src="assets/site.js"></script>
  </body>
</html>
```

Keep the entry, for example `template.html`, and `assets/site.css` and `assets/site.js` inside the
same package. Relative paths are resolved from the package root while Pandoc runs.

HTML export always creates a target folder containing the page. **Self-contained HTML** starts off:

```text
note/
  note.html
  note.assets/
    local-image.png
  assets/
    site.css
    site.js
```

The template asset tree is copied beside the page. The note's local pictures go under
`note.assets/` and their URLs are rewritten. A picture written as an `http://` or `https://` URL
stays that URL; Yi does not replace it with a temporary local copy for HTML.

When **Self-contained HTML** is on, Pandoc embeds local CSS, JavaScript and pictures into the page.
The bundle still receives the complete package asset tree, so files not named by the rendered page
are not silently lost.

## Author LaTeX and PDF templates

LaTeX and PDF packages both use Pandoc text templates. Their entries contain `$body$`, for example
`template.tex`:

```tex
\documentclass{article}
\usepackage{booktabs}
\usepackage{graphicx}
$if(highlighting-macros)$
$highlighting-macros$
$endif$
\begin{document}
$if(title)$
\title{$title$}
\maketitle
$endif$
$body$
\end{document}
```

Use `$body$` exactly once. Other Pandoc variables such as `$title$`, `$author$`, `$date$`, `$toc$`,
`$header-includes$`, `$highlighting-macros$` and `$for(...)$` loops are described by Pandoc's template
manual. Yi does not rewrite or inject compatibility preambles into your template. If a command used
by the document is missing upstream, validation or TeX reports it.

### LaTeX output

LaTeX export copies the complete package asset tree beside the `.tex` output, not only the files in
`deliver`. This includes classes, styles, bibliography files, figures, data files and supporting
sources. The output is a source package the reader can compile:

```text
article/
  article.tex
  journal.cls
  journal.bst
  figures/
    diagram.pdf
```

The manifest's `deliver` field documents the class and bibliography-style subset that belongs with
the submission. A different file already at the destination is never overwritten; Yi reports the
conflict.

### PDF output

PDF uses the `.tex` template through Pandoc and the configured `pdf-engine`. The package root and the
entry's own folder are on the TeX/BibTeX search paths, and the run works from the entry's folder.
This lets a nested `samples/template.tex` find both `samples/...` inputs and a class at the package
root.

For a package named `example-pdf`, a useful `defaults.yaml` is:

```yaml
pdf-engine: xelatex
highlight-style: pygments
standalone: true
```

Yi refuses package defaults that enable unrestricted shell escape. Filters are still executable
code under the template trust notice, so only use templates you trust.

## Author EPUB templates

An EPUB template is an XHTML document with `$body$`, stored as `template.xhtml`:

```html
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="$lang$" xml:lang="$lang$">
  <head>
    <meta charset="utf-8">
    <title>$pagetitle$</title>
    <link rel="stylesheet" href="assets/book.css">
  </head>
  <body>
    <section class="chapter">
      <h1>$title$</h1>
      $body$
    </section>
  </body>
</html>
```

Pandoc builds the EPUB container. Yi then packs package CSS, JavaScript, pictures and fonts into
`EPUB/assets/`, rewrites chapter-relative URLs and declares the resources in `content.opf`.

EPUB requires `title` and `lang` metadata. Yi takes them from the note where available and has
defaults for a new pathless export. Use a separate EPUB validator in your own review workflow;
Yi's template validation converts the package, but does not replace one.

## Author Word and OpenDocument templates

Word and OpenDocument packages are **reference documents**, not text templates. Create a document in
Word or LibreOffice, define the styles you want, and use it as the package entry:

```text
example-docx/
  template.json
  reference.docx
  defaults.yaml
  metadata.yaml

example-odt/
  template.json
  reference.odt
  defaults.yaml
  metadata.yaml
```

Pandoc copies styles from the reference document into the exported file. Keep its style names and
structure stable:

- `title` uses **Title**;
- `subtitle` uses **Subtitle**;
- `author` uses **Author**;
- `date` uses **Date**;
- Word's `abstract` uses **Abstract Title** followed by **Abstract** paragraphs; the ODT example
  keeps the abstract and keywords together on the **Abstract** page;
- captions use the caption styles, and `keywords` and other metadata are available for custom use.

The package's `metadata.yaml` is starting frontmatter for a new note, so it should demonstrate every
document-level field the reference document styles. The DOCX and ODT examples include `title`,
`subtitle`, `author`, `date` and a multi-line `abstract`.

The dissertation ODT adds page master styles for the cover, abstract, contents and body. Its
`example.md` uses custom paragraph styles to place the four labelled cover fields, force the
two-level contents page and begin the body on page four. The cover illustration is embedded in
`reference.odt`; its editable SVG and generated PNG are kept in the ODT example package.

- use Word/LibreOffice built-in paragraph styles where possible;
- define headings, body text, quotations, code and captions consistently;
- set page size and margins in the reference document;
- test a document containing a heading, list, table, picture and code block.

Yi does not edit binary reference documents. **Open in system** opens them in the application that
owns the format.

## Package YAML

Two conventional YAML files live at the package root and add behaviour without new manifest fields.

### metadata.yaml

When a package has a root `metadata.yaml`, Yi offers it while creating a new note. The package's
top-level keys win over the configured new-note frontmatter, while `date` and `id` always remain
app-owned. Keys only the configured frontmatter has remain present.

```yaml
title: Template title
author: Example Author
keywords:
  - journal
  - template
category:
  name: article
```

This choice belongs to one note. It does not set the package as the note's export template.

### export.yaml and defaults.yaml

If a package contains `export.yaml`, Yi passes that file to Pandoc after the app's
`export.<kind>.yaml`. If it has no `export.yaml`, a root `defaults.yaml` plays the same role.
`export.yaml` takes precedence when both exist.

Package defaults therefore win over the app defaults, but explicit command-line paths and options
still take precedence: output, the chosen template or reference document, CSL and resource paths.
Filters, metadata files and resource-path entries are resolved from the package root.

Use the package file for settings that belong to the package:

```yaml
standalone: true
toc: true
toc-depth: 3
highlight-style: pygments
metadata:
  subject: Example document
```

Do not copy every setting from Yi's global defaults. Keep the package file small and document only
what the template genuinely requires.

### Complete examples

The repository contains one complete, workable package for every kind under:

```text
test/fixtures/templates/examples/
  html/
  latex/
  pdf/
  epub/
  docx/
  odt/
```

Each package contains `template.json`, its text entry or binary reference document,
`defaults.yaml`, `metadata.yaml`, and an explanatory `README.md`. Open those folders as authoring
references, then import the same folder into Yi to see the package in the Template library.

The Word package also contains `example.md`. Open it as a note and export it as Word to inspect every
reference style: title metadata, all nine heading levels, first and body paragraphs, lists, code,
math, quotes, footnotes, captions, a figure, definitions and a bibliography.

## Validate before using a template

Before exporting a real note:

1. Open the package in the template editor.
2. Press **Validate** and read the complete message.
3. For PDF, press **Test PDF** if the first check passes.
4. Export a short note containing headings, lists, a table, code, math and a picture.
5. Inspect the output, especially relative assets and bibliography files.

Validation is intentionally a real conversion into a temporary folder. It is not a promise that an
arbitrary note will never expose a missing class or malformed variable; it catches package-level
mistakes before the real export.

Common failures:

| Message | What to check |
| --- | --- |
| Pandoc not found | Install Pandoc and restart Yi from a terminal with the updated `PATH` |
| PDF engine not found | Install a TeX distribution and confirm `xelatex --version` |
| File `journal.cls` not found | Keep it in the package and put the package root on the TeX search path |
| Template variable missing | Compare the template with Pandoc's variables for that writer |
| Filter could not start | Install the filter's runtime, or remove it from package defaults |
| Local picture missing | Use a package-relative path and keep the picture in `assets` |
| Web picture missing in PDF | Pandoc must be able to fetch it, or use a local copy |

## Security and trust

A template is executable conversion configuration. It can include Pandoc filters, Lua scripts,
LaTeX packages, classes, fonts and metadata files. Use journal kits and community templates you
trust.

Yi records `origin.source` and `origin.license` but does not decide whether you have permission to
use a kit. Keep those fields accurate when you publish a package.

The application:

- does not download journal templates;
- does not install TeX packages or run `tlmgr`;
- does not allow a PDF package defaults file to enable unrestricted shell escape;
- does not rewrite arbitrary journal examples into a perfect Pandoc template;
- does not silently fill missing template variables or add a compatibility preamble.

## Package checklist

Before sharing a package:

- [ ] The folder has an app-written `template.json` with schema 1.
- [ ] `kind` matches the intended export kind.
- [ ] One entry is present and matches `mode`.
- [ ] A text template contains `$body$` exactly where the document belongs.
- [ ] A reference document opens in Word or LibreOffice.
- [ ] Every path in `assets`, `deliver` and `csl` exists.
- [ ] Relative links use `/`, point inside the package and have matching assets.
- [ ] `metadata.yaml`, if present, is a top-level YAML mapping.
- [ ] `defaults.yaml` or `export.yaml` contains only settings the package needs.
- [ ] PDF defaults do not enable shell escape.
- [ ] Validation succeeds with a short representative note.
- [ ] The source and licence are recorded.
- [ ] A real export contains the expected classes, styles, pictures and references.

The best package is small enough to inspect, explicit about its assets and predictable when another
writer exports the same kind of note.
