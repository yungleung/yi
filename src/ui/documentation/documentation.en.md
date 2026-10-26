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

## Cross-references and heading attributes

Internal links use ordinary Markdown link syntax. A destination beginning with `#` names a heading in
the current document:

```markdown
See [Reading methods](#reading-methods).
```

⌘-click or Ctrl-click the link to reveal and focus that heading. A plain click still opens the
link's Markdown for editing. A link to another document, such as `note.md#reading-methods`, remains
a file link.

When a heading has no explicit ID, Pandoc derives one from its text: formatting is removed,
whitespace becomes `-`, letters are lowercased, and punctuation other than `_`, `-`, and `.` is
removed. Text before the first letter is discarded, and punctuation-only headings use `section`.
Repeated automatic IDs receive `-1`, `-2`, and so on. IDs are recalculated in document order after
edits: if you insert another heading with the same title above an existing one, the new first heading
gets the base ID and the later heading receives `-1`.

ATX and setext headings may end with a Pandoc attribute block separated from the title by
whitespace:

```markdown
### Reading methods {#reading-methods .unnumbered data-owner=demo}

Setext heading {#setext-heading .unnumbered}
===========================================
```

`#reading-methods` supplies the link target. Yi leaves `.unnumbered` and `data-owner=demo` for
Pandoc without applying them to the editor's own layout. Heading attributes stay hidden while the
caret is elsewhere and become editable when the caret enters the heading.

While typing an ATX heading, its `#` characters remain visible until the delimiter space is typed;
the rendered heading begins at that space.

Keep explicit heading IDs unique. Pandoc leaves duplicate explicit IDs unchanged and warns; Yi
follows the first matching heading. Both heading attributes and internal links are valid Pandoc
Markdown, so Pandoc exports and the processed Markdown export preserve them.

### Figures

A standalone image with non-empty alt text is a figure. Its alt text is its caption, and every
figure receives a number in document order:

```markdown
See [#fig:sample] or the [sample figure](#fig:sample).

![A sample image](images/sample.png){#fig:sample .wide width=80%}
```

When one unlabeled figure appears before it, `[#fig:sample]` displays “Figure 2” and links to the
labeled figure. Only a figure with an explicit ID can be referenced.

The attribute block follows Pandoc image syntax. Yi applies only the ID to its editor DOM and keeps
classes and other attributes for export. Images inside a paragraph remain inline images: they are
laid out on the same line as the surrounding words, and are not captioned, numbered, or
referenceable.

⌘-click or Ctrl-click a figure reference to reveal and focus the figure. A plain click on the figure
opens its complete image Markdown for editing.

Rendered HTML, EPUB, Word, and ODT exports receive a numbered caption and a format-appropriate
bookmark. LaTeX and PDF use the native figure counter. Processed Markdown emits an HTML `<figure>`
with an ID and numbered `<figcaption>` so common Markdown readers can display it.

### Tables

Yi keeps the ordinary GitHub-flavored pipe table and adds a Pandoc caption line after it. The
caption begins with a colon and one or more spaces:

```markdown
| Metric | Value |
| --- | ---: |
| alpha | 1 |

: Results {#tbl:results .margin data-owner=demo}
```

No blank line or one blank line may separate the table from its caption. Two blank lines end the
table; a following colon line then belongs to the next block. The caption may contain inline
Markdown. Its trailing Pandoc attribute block supplies the reference ID, classes, and key/value
attributes. Leave a space between the caption text and the attribute block.

Every captioned table consumes one table number in document order. A table without a caption has
no table number and no target. The three referencable-looking forms behave differently:

```markdown
| A | B |
| --- | --- |
| one | two |

: A caption without an ID

| A | B |
| --- | --- |
| three | four |

: {#tbl:target}

| A | B |
| --- | --- |
| five | six |

: Labeled table {#tbl:named}
```

The first table is numbered but cannot be referenced. The second is numbered and is a reference
target even though its visible caption contains only the generated number. The third has both a
visible caption and a target. `.margin`, `.wide`, and other classes stay in the source for Pandoc
and template packages; Yi applies only the ID to its editor DOM.

Use an automatic reference when Yi should infer the visible words, or a normal Markdown link when
you want your own words:

```markdown
See [#tbl:named] for the measurements.
See [the measured values](#tbl:named) for the same table.
```

The automatic form displays the configured label and number, such as `Table 3`. ⌘-click or
Ctrl-click either form to reveal the table and place the caret in its first header cell. The
browser location hash is not changed. An ordinary click on the generated caption opens the complete
`: …` caption line for editing, including the attribute block.

The optional separator is source syntax and is not rendered as an empty line. The table and caption
look identical whether the source is joined directly or separated by one blank line. To add or
remove that source blank line, open the caption source and put the caret at its start; `Enter` adds
the separator and `Backspace` removes it.

`Enter` in the final table cell leaves the table and puts the caret after it; subsequent typing
stays on that line rather than returning to the last cell.

#### Table labels and prefixes

The default label is `Table` and the default prefix is empty. Set either in the note's frontmatter:

```yaml
---
reference-labels:
  table: Data table
reference-number-prefixes:
  table: "2-"
---
```

With these values, the first captioned table displays `Data table 2-1`. A missing or blank value
falls back to English defaults. The prefix is literal text. Yi does not infer a chapter or section
number because an export template may shift heading levels; use the template when numbering must
follow the document's own structure.

#### Table export

The source remains Pandoc Markdown in every Pandoc-backed export:

- HTML and EPUB receive the native table, ID, attributes, and a visible numbered caption.
- Word and ODT receive a `Div` with the table ID so Pandoc writes a bookmark or named section. The
  visible caption carries the number, and classes and key/value attributes remain on that caption.
- LaTeX and PDF keep the native caption and label. Automatic table references become
  `\yiTableRef{id}`, which prints the document's `\tablename` and reads the final number with
  `\ref`. A template or class can therefore redefine `\thetable` and retain control of numbering.
- Processed Markdown writes the table as semantic HTML with `<table>`, `<caption>`, the target ID,
  alignment, classes, and `data-*` attributes. Common Markdown readers display it. Re-importing that
  file treats the table as raw HTML, not as a Yi pipe table.

Manual table links remain ordinary `\hyperref` links in LaTeX and PDF, so their author-written text
is preserved. Automatic references to headings and figures keep their existing behavior.

`.margin` does not place a table in a margin by itself. Yi ships no margin-table Lua filter, keeps
no separate margin-table sequence, and adds no margin styles. A template package can implement
that layout with its own class, filter, and table environment.

For a LaTeX or PDF text template, expand Pandoc's header variable in the preamble:

```tex
$if(header-includes)$
$header-includes$
$endif$
```

A Lua filter that rewrites a table must preserve both the caption and the identifier, causing
normal `\caption{…}` and `\label{…}` output. Do not hard-code the visible number, use
`\caption*` for a numbered table, or replace the shared LaTeX table counter with a separate one.
The included template examples show the expected filter shape.

### Equations

Ordinary display math remains ordinary Markdown:

```markdown
$$
E = mc^2
$$
```

It renders as a formula but has no target and no equation number.

A targetable equation wraps the complete display-math block in a Pandoc bracketed Span:

```markdown
[$$
E = mc^2
$$]{#eq:energy}
```

An ID is optional for display. `[$$…$$]{}` and `[$$…$$]{.wide}` render normally but cannot be
referenced; add `#eq:id` when the formula needs a target.

The attribute block belongs after `$$]`; it may contain classes and key/value attributes:

```markdown
[$$
\begin{aligned}
E &= mc^2\\
p &= mv
\end{aligned}
$$]{#eq:relations .wide data-owner=demo}
```

`$${#eq:energy}` is not a target. Pandoc reads `{#eq:energy}` as math content. The final
`[$$…$$]{#id}` form is the supported syntax.

Typing `[$$` at the start of an empty line creates:

```markdown
[$$

$$]{}
```

The caret lands on the formula body. The empty `{}` is the attribute placeholder; attach an ID to
make the equation targetable.

#### Equation environments and IDs

KaTeX supports the following equation-related forms. Every row behaves as shown both with and
without an ID:

| Source body | No ID | With `#eq:id` |
| --- | --- | --- |
| Plain formula | Unnumbered; no target | One number and target |
| `equation` | Native number suppressed | One target; body used inside the generated equation |
| `equation*` | Already unnumbered | One target |
| `align` | Row numbers suppressed | `aligned` inside one generated equation |
| `align*` | Already unnumbered | `aligned` inside one generated equation |
| `aligned` | Already unnumbered | Existing inner layout inside one generated equation |
| `gather` | Row numbers suppressed | `gathered` inside one generated equation |
| `gather*` | Already unnumbered | `gathered` inside one generated equation |
| `gathered` | Already unnumbered | Existing inner layout inside one generated equation |
| `alignat` | Row numbers suppressed | `alignedat` inside one generated equation |
| `alignat*` | Already unnumbered | `alignedat` inside one generated equation |
| `alignedat` | Already unnumbered | Existing inner layout inside one generated equation |
| `split` | Already unnumbered | Existing inner layout inside one generated equation |

One display-math block is one target regardless of how many rows its environment contains.
Individual-row references are outside this release.

#### Equation references and labels

Use an automatic reference when Yi should infer the label:

```markdown
See [#eq:energy].
```

The default display text is `Equation (1)`. A manual link remains ordinary Markdown:

```markdown
See [the energy relation](#eq:energy).
```

Its text is author-controlled. `[text]{#id}` is a bracketed Span, not a link, and is not a reference
form.

The equation label and literal number prefix come from the note's frontmatter:

```yaml
reference-labels:
  equation: Formula
reference-number-prefixes:
  equation: "2-"
```

With those values, the reference displays `Formula (2-1)`, while the numbered formula itself shows
only `(2-1)`. A missing or blank value falls back to `Equation` and an empty prefix.

Clicking the rendered equation reveals the complete `[$$…$$]{…}` source. ⌘-click or Ctrl-click an
automatic or manual reference to reveal the equation and place the caret at the start of its formula
body. The browser location hash is not changed.

While the complete source is shown, clicking a formula line places the caret at the character
clicked. The equation stays visible while an attribute token is unfinished, such as `{.wide #}`, or
while text is appended after its closing brace. Leaving the source renders the formula again; an
attribute without an ID simply leaves it untargetable.

#### Equation export

Native equation-environment numbering is suppressed in the editor and every export:

- HTML receives an unnumbered KaTeX body and one visible Yi number.
- EPUB receives one ID-bearing target and one visible number, even if its template later selects
  KaTeX or MathJax.
- Word and ODT receive an ID-bearing target, one visible number, and a formula without row numbers.
- LaTeX and PDF receive exactly one generated outer `equation`; multi-row user environments are
  lowered to `aligned`, `gathered`, or `alignedat` inside it.
- Processed Markdown emits an ID-bearing HTML block containing KaTeX-generated MathML and one
  visible number.

The visible equation number always has the form `(N)` or `(prefix-N)`. The configured equation
label appears only in automatic-reference text.

An automatic LaTeX/PDF equation reference becomes `\yiEquationRef{id}` and reads the document's
final `\theequation`. A template can therefore redefine the equation counter without conflicting
with Yi's visible numbering.

Explicit author `\tag{…}` is not Yi numbering. It remains author-controlled math content and is not
part of automatic equation-reference resolution.

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
- `csl` optionally names a package CSL file. Yi applies it after the reader's selected CSL, so this
  field is how a template enforces its own citation style. Leave it `null` to follow Settings →
  Citation.
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

For a journal with separate institutions and emails, keep the author data in frontmatter and let the
template emit it:

```yaml
author:
  - name: Ada Example
    affiliation: Department of Physics, First University
    email: ada@first.example
  - name: Bo Example
    affiliation: Institute for Astronomy, Second University
    email: bo@second.example
```

```tex
$for(author)$
\author{$author.name$}
$if(author.email)$\email{$author.email$}$endif$
$if(author.affiliation)$\affiliation{$author.affiliation$}$endif$
$endfor$
```

Do not put the example paper's title, names, institutions or emails in the template itself. That
makes the package appear to work in validation while silently replacing another note's author data.

### LaTeX output

LaTeX export copies the complete package asset tree beside the `.tex` output, not only the files in
`deliver`. This includes classes, styles, bibliography files, figures, data files and supporting
sources. The output is a source package the reader can compile:

```text
article/
  article.tex
  references.bib
  journal.cls
  journal.bst
  figures/
    diagram.pdf
```

The manifest's `deliver` field documents the class and bibliography-style subset that belongs with
the submission. A different non-generated file already at the destination is never overwritten; Yi
reports the conflict. The generated `references.bib` described below belongs to the export and is
replaced when the note is exported again.

Local pictures named by the note are copied into the source folder. A note picture that uses the
same relative path as a package asset replaces that package copy in the output; other pictures are
placed under `<output-name>.assets/` and the `.tex` names them relatively. It never keeps a path into
Yi's package store or the note's original machine location.

To compile a source tree whose bibliography style is in `bibliography/`, tell BibTeX where that
folder is:

```sh
export BSTINPUTS=".:bibliography:"
latexmk -pdf -interaction=nonstopmode -halt-on-error article.tex
```

Without `latexmk`, run `pdflatex`, `bibtex`, and then `pdflatex` twice more.

If `latexmk` reports `LaTeX didn't generate the expected log file`, verify the TeX engine directly:

```sh
/Library/TeX/texbin/pdflatex -interaction=nonstopmode -halt-on-error article.tex
```

This means `latexmk` did not receive a normal engine log; it is not evidence of a template or
bibliography error. If `pdflatex` reports `Operation not permitted` for a `.fls`, `.log` or output
file, the process cannot write to the source folder. That commonly happens in a restricted or
sandboxed terminal, or when macOS has denied folder access. Compile from an ordinary Terminal
window with the source folder accessible, then run `latexmk` again to complete BibTeX and the
remaining reruns.

### Native BibTeX source

Some journals expect citations to remain as TeX citation commands and the bibliography to be built
by BibTeX. A package opts into that source mode in `defaults.yaml`:

```yaml
filters: []
cite-method: natbib
bibliography: references.bib
```

The value of `bibliography` is the relative path the template refers to, conventionally:

```tex
\bibliographystyle{apsrev4-2}
\bibliography{references}
```

The file bundled in the package is an authoring sample. At export time the library selected in
**Settings → Citation** is authoritative. Yi reads the citation keys from the actual Markdown
parse, keeps only those works, and writes them to the declared `references.bib` beside the `.tex`.
A selected BibTeX library is filtered to the cited entries. A selected CSL-JSON library is also
converted to BibTeX, using `citation-key` when present and the item's `id` otherwise. Uncited works
never enter the exported bibliography.

The package may list other filters instead of an empty list; the native path is selected when the
filter list does not contain `citeproc`. With no bibliography selected and citations present,
export reports that a library is required instead of substituting the package's example. Citation
keys missing from the selected library are reported as export warnings.

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

### Start from Pandoc’s reference document

Pandoc’s [`--reference-doc` section](https://pandoc.org/MANUAL.html#option--reference-doc) is the
authoritative description. It includes separate DOCX and ODT guidance, the supported style names
and Pandoc’s recommended creation workflow. The complete [Pandoc User’s
Guide](https://pandoc.org/MANUAL.html) documents the other export settings Yi passes through.

The safest starting point is a document produced by Pandoc itself. In Yi, **Create…** can generate
the default reference document for Word or LibreOffice. From a terminal, the equivalent commands
are:

```sh
pandoc -o custom-reference.docx --print-default-data-file reference.docx
pandoc -o custom-reference.odt --print-default-data-file reference.odt
```

Open the generated file in Word or LibreOffice, modify its styles, and save it. Keep the style names
Pandoc expects; changing a style’s font, spacing, colour or borders is safe, while renaming the
style makes it unavailable for the corresponding Markdown element.

Pandoc reads the two formats slightly differently:

- A DOCX reference document supplies its styles and document properties, including page size,
  margins, headers and footers. Its visible body content is ignored.
- An ODT reference document supplies its stylesheets. Its visible body content is ignored.

After editing, save the file as `reference.docx` or `reference.odt`, create or update a package for
the matching Word or LibreOffice export kind, and choose that file as the package entry. Yi does not
edit the binary document; **Open in system** opens it for further styling.

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
`example.md` uses only Markdown Yi renders. Frontmatter places the four labelled cover fields and
the abstract, `defaults.yaml` asks for Pandoc's automatic two-level contents, and the first level-one
heading begins the body. Only the body master page has a footer, with numbering restarted at 1.
The cover illustration is embedded in `reference.odt`; its editable SVG and generated PNG are kept
in the ODT example package.

Word and OpenDocument contents tables are fields. Their reference documents mark fields to update
when opened, so readers do not receive an empty contents control after exporting.

Pandoc-only constructs such as fenced `::: {custom-style="…"}` blocks, `{#id}`/`{.class}` attribute
blocks, superscript or subscript markers, and headings deeper than level six are not Yi Markdown.
They display literally in the editor. Use supported Markdown and put page and paragraph behavior in
the reference document's styles instead.

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

This precedence matters for citation styles. A `csl` entry in `export.yaml` or `defaults.yaml` is
only a fallback: when the reader has a CSL selected in Settings → Citation, Yi passes that selected
style later and it wins. To make a package enforce its own citation style, set the style file in the
manifest's `csl` field instead. That package CSL is applied after the reader's style.

Do not add citeproc to package defaults to change citation behavior. Yi already supplies citeproc
for Pandoc-written files; adding it again runs the filter twice and can duplicate references.

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

The repository contains one complete, workable package for every kind, plus the licensed Rho Class
research-article design, under:

```text
test/fixtures/templates/examples/
  html/
  latex/
  pdf/
  rho-class/
  epub/
  docx/
  odt/
```

Each package contains `template.json`, its text entry or binary reference document,
`defaults.yaml`, `metadata.yaml`, and an explanatory `README.md`. Open those folders as authoring
references, then import the same folder into Yi to see the package in the Template library.

### Prompts for AI agents

The prompts below ask an AI coding agent to create an importable source folder for each finished
example. They intentionally leave out `template.json`: Yi inspects the source folder and writes that
manifest during import. Replace the example folder name and visual direction when adapting a prompt.

#### Example prompt: HTML

```text
Create an importable Yi HTML template source package in `my-html-template/`, modelled on
`test/fixtures/templates/examples/html/`. Make a polished technical article or documentation page
with a responsive main column, a sticky sidebar table of contents, accessible landmarks, and
print-friendly styles.

Include:

- `template.html`, a Pandoc template containing `$body$` once and `$table-of-contents$` in the
  sidebar;
- `defaults.yaml` with `standalone: true`, `toc: true`, and `toc-depth: 2`;
- `metadata.yaml` with a representative title, subtitle, author, date, description, language, and
  keywords;
- `assets/site.css` and `assets/site.js` for package-local styling and active-section highlighting;
- `example.md` using only Markdown supported by Yi; and
- `README.md` explaining the files and how to validate and export the package.

Keep asset URLs relative to the package root. A Bootstrap CDN link in the rendered page is allowed,
but all custom files needed by the design must be in the package. Do not create `template.json`.
Do not download journal assets, install TeX packages, run `tlmgr`, enable shell escape, or use
unrestricted `\write18`. Run Pandoc with the package and report the files produced and any check
that could not run.
```

#### Example prompt: LaTeX

```text
Create an importable Yi LaTeX template source package in `my-latex-template/`, modelled on
`test/fixtures/templates/examples/latex/`. Design a restrained journal-style article with a title,
author block, abstract, two-level table of contents, highlighted code, figures, tables, footnotes,
and a bibliography.

Include:

- `template.tex`, a standalone Pandoc template containing `$body$` exactly once;
- `journal.sty` for the package's article styling;
- `journal.bst` for the bibliography style;
- `references.bib` as authoring sample data, plus at least one figure under `figures/`;
- `defaults.yaml` with `standalone: true`, `shift-heading-level-by: 0`,
  `bibliography: references.bib`, `cite-method: natbib`, no `citeproc` filter, and only the other
  settings the template requires;
- `metadata.yaml` with representative article metadata, including three authors whose names,
  affiliations and email addresses are distinct;
- `example.md` using only Markdown supported by Yi; and
- `README.md` identifying `journal.sty` and `journal.bst` as assets to deliver beside the exported
  `.tex` file.

Do not invent or silently substitute a downloaded journal class. If the design needs a class or
support file, include an original file or report that the user must supply a trusted licensed copy.
Use the ordinary Pandoc highlighting variables when needed; do not add a compatibility preamble to
notes. Keep every local reference inside the package with `/`-separated relative paths. Do not
create `template.json`; Yi writes it on import. Do not download journal assets, install TeX
packages, run `tlmgr`, enable shell escape, or use unrestricted `\write18`. Run Pandoc and, when
available, a TeX compile, then report the files and results. Keep the title, authors and
affiliations out of the template: they must come from note metadata.
```

#### Example prompt: PDF

```text
Create an importable Yi PDF template source package in `my-pdf-template/`, modelled on
`test/fixtures/templates/examples/pdf/`. Design a polished academic report for XeLaTeX with a
title page, abstract, section hierarchy, code highlighting, figures, a table, footnotes, and a
bibliography.

Include:

- `template.tex`, a standalone Pandoc template containing `$body$` exactly once;
- `report.sty` for the design and any standard TeX dependencies it declares;
- `defaults.yaml` with `pdf-engine: xelatex`, `standalone: true`,
  `shift-heading-level-by: 0`, and only the settings the package genuinely needs;
- `metadata.yaml` with representative report metadata;
- `example.md` using only Markdown supported by Yi; and
- `README.md` explaining the required TeX packages, how to run Validate and Test PDF in Yi, and
  what the generated document should contain.

The template must work from the package root and must not depend on files outside it. Do not create
`template.json`; Yi writes it on import. Do not download journal assets, install TeX packages, run
`tlmgr`, enable shell escape, or use unrestricted `\write18`. If a TeX package is unavailable,
report it rather than trying to install it. Run the complete Pandoc-to-XeLaTeX path when possible
and report the output and diagnostics.
```

#### Example prompt: Rho Class PDF

```text
Create an importable Yi PDF template source package in `my-rho-template/`, modelled on
`test/fixtures/templates/examples/rho-class/` and the CC BY 4.0 Rho Class research-article design:
<https://latextemplates.com/template/rho-class-article/>.

Preserve the upstream `rho.cls`, `rhobabel.sty`, `rhoenvs.sty`, source URL and
`ATTRIBUTION.txt`. Credit Guillermo Jimenez as the licence requires. Do not rename the upstream
class or imply that the design is original.

Include:

- `template.tex`, a Pandoc template containing `$body$` exactly once and taking title, authors,
  affiliations, abstract, keywords, date and journal fields from note metadata;
- `defaults.yaml` with pdfLaTeX, unshifted headings, and only the package-specific table filter;
  Yi supplies citeproc and the selected bibliography, while the manifest overrides the citation
  style with the package IEEE CSL;
- `rho.bib`, `ieee.csl`, and a small Lua filter for tables that must span the two-column layout;
- `metadata.yaml` and `example.md` demonstrating three authors, distinct affiliations, an abstract,
  journal footer, callout, mathematics, code, figure, table, footnote and numbered reference;
- `README.md` explaining the upstream licence, TeX dependencies, Test PDF and export workflow.

Keep Markdown within Yi's supported syntax. Keep user-visible metadata out of the template. Do not
create `template.json`; Yi writes it on import. Do not download journal assets, install TeX
packages, run `tlmgr`, enable shell escape, or use unrestricted `\write18`. Run Test PDF and export
the complete example, then inspect the rendered page and report the result.
```

#### Example prompt: EPUB

```text
Create an importable Yi EPUB template source package in `my-epub-template/`, modelled on
`test/fixtures/templates/examples/epub/`. Design a literary novella with a striking cover, a title
and imprint page carrying publisher, edition, ISBN, rights, and dedication, followed by three short
chapters and a visible Contents page.

Include:

- `template.xhtml`, a valid XHTML Pandoc template that handles `coverpage`, `titlepage`, and ordinary
  chapter pages and contains `$body$` exactly once;
- `assets/book.css` for the complete reflowable book design;
- `assets/cover.svg` as the library cover image;
- `defaults.yaml` with `standalone: true`, `toc: true`, `toc-depth: 2`,
  `shift-heading-level-by: 0`, `epub-cover-image: assets/cover.svg`, and the needed chapter settings;
- `metadata.yaml` with title, subtitle, author, language, publisher, identifier, ISBN, rights,
  dedication, description, and keywords;
- `example.md` containing three level-one chapters and only Markdown supported by Yi; and
- `README.md` explaining the front matter, visible contents, cover replacement, and validation.

Keep CSS, images, fonts, and scripts inside the package and use package-relative URLs. Let Pandoc
generate the EPUB navigation and visible Contents page from the headings. Do not create
`template.json`; Yi writes it on import. Do not download journal assets, install TeX packages, run
`tlmgr`, enable shell escape, or use unrestricted `\write18`. Validate the rendered EPUB with
epubcheck when it is available and report all diagnostics.
```

#### Example prompt: Word

```text
Create an importable Yi Word reference-document package in `my-word-template/`, modelled on
`test/fixtures/templates/examples/docx/`. Design a clean academic or professional report whose
styles carry title, subtitle, author, date, abstract title, abstract, headings one through nine,
body and first paragraphs, quotations, code, captions, lists, footnotes, tables, figures, and a
bibliography.

Include:

- `reference.docx`, generated and inspected with Word-compatible tooling;
- `defaults.yaml` with `standalone: true`, `toc: true`, and `toc-depth: 2`;
- `metadata.yaml` demonstrating title, subtitle, author, date, abstract, language, and keywords;
- `example.md` covering every reference style using only Markdown supported by Yi;
- `example.svg` for the figure; and
- `README.md` naming the expected Word styles and explaining how to update the reference document.

Mark the contents and other generated fields for refresh when Word opens the exported document.
Keep local assets inside the package. Do not create `template.json`; Yi writes it on import. Do not
download journal assets, install TeX packages, run `tlmgr`, enable shell escape, or use unrestricted
`\write18`. Export the example with the package when possible, inspect the resulting contents field
and style set, and report the checks and any unavailable tooling.
```

#### Example prompt: OpenDocument

```text
Create an importable Yi OpenDocument reference package in `my-odt-template/`, modelled on
`test/fixtures/templates/examples/odt/`. Design an A4 academic dissertation with a college-image
cover, four labelled and underlined lines for author, institution, instructor, and date, a second
page for the abstract and keywords, a third-page two-level Contents table, and body pages starting
at page 1.

Include:

- `reference.odt` with the named paragraph, heading, quote, code, caption, table, figure, footnote,
  bibliography, and page-master styles;
- `college-cover.svg` as the editable cover source and the embedded raster version used by the ODT;
- `defaults.yaml` with `standalone: true`, `toc: true`, `toc-depth: 2`, and
  `shift-heading-level-by: 0`;
- `metadata.yaml` showing the four cover fields, abstract, keywords, language, and title;
- `example.md` using only Markdown supported by Yi;
- `example.svg` for the figure; and
- `README.md` explaining the page masters, automatic contents field, and body-only page numbering.

The cover, abstract, and contents pages must not show page numbers. Keep local assets inside the
package. Do not create `template.json`; Yi writes it on import. Do not download journal assets,
install TeX packages, run `tlmgr`, enable shell escape, or use unrestricted `\write18`. Export the
example when possible and verify the visible two-level Contents table, page numbering, cover, and
embedded assets in LibreOffice or OnlyOffice; report any tooling that was unavailable.
```

The Word package also contains `example.md`. Open it as a note and export it as Word to inspect every
reference style: title metadata, all nine heading levels, first and body paragraphs, lists, code,
math, quotes, footnotes, captions, a figure, definitions and a bibliography.

The LaTeX package's `example.md` is a three-author PRL paper. Export it as LaTeX, set the Citation
tab to its `references.bib`, and the output folder contains the generated `.tex`, a cited-only
`references.bib`, `figures/cmb-spectrum.pdf`, and `bibliography/apsrev4-2.bst`.

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
