# Presentation Exports and Rho Callouts Design

**Status:** Approved for implementation  
**Date:** 2026-10-29

## Goal

Add Reveal.js and Beamer as first-class export kinds without template-package
support, provide built-in presentation metadata choices when creating a note,
publish user-facing examples separately from test fixtures, and make the Rho
Class example use Yi callouts for its Note and Information panels.

## Boundaries

- Reveal.js and Beamer accept no export template package. Their configuration
  lives in their shipped defaults file and in note frontmatter/document
  attributes.
- `examples/` is user-facing reference material. It is not a test fixture and
  application behavior must not depend on it.
- `test/fixtures/` remains controlled, self-contained test data. Tests may
  validate the published examples, but behavioral tests do not use the root
  examples as their working fixture.
- Beamer exports one PDF. Reveal.js exports a local bundle by default.
- The Reveal.js export card offers two independent remote-resource choices,
  both defaulting off:
  - Use remote Reveal.js resources.
  - Use remote pictures.

## Export Kind Contract

Add two rows to Rust's `KINDS` table:

| Field | Reveal.js | Beamer |
| --- | --- | --- |
| `kind` | `revealjs` | `beamer` |
| Pandoc writer | `revealjs` | `beamer` |
| Extension | `html` | `pdf` |
| Needs Pandoc | yes | yes |
| Template mode | none | none |
| Carries pictures as-is | yes | no |
| Takes a card page size | no | no |
| Takes its title from the app | no | no |
| App writes its body name | no | no |
| Needs a language from the app | no | no |
| Needs font diagnostics | no | yes |
| Ships a font header | no | no |
| Defaults file | `export.revealjs.yaml` | `export.beamer.yaml` |

The rows control the File menu, export card, configuration path, package
rejection, and run. No separate menu or dialog switch lists the new kinds.

Beamer belongs to the LaTeX export family for source rewriting:

- table, list, equation, and automatic-reference lowering use the
  counter-backed LaTeX form;
- the generated reference header is included;
- local and remote pictures are rasterised when required;
- XeLaTeX is the default engine.

Reveal.js belongs to the HTML-like family for source rewriting and picture
handling, except that its output is always the Reveal.js bundle described
below rather than the normal HTML target.

## Reveal.js Bundle

A Reveal.js export target is a folder:

```text
presentation/
  presentation.html
  images/
  js/
    dist/
      reset.css
      reveal.css
      reveal.js
      theme/
        <theme>.css
      plugin/
        notes.js
        search.js
        zoom.js
```

The generated page is `<target-folder>/<target-folder-name>.html`.

The defaults file is never self-contained and names `revealjs-url: js`, so
Pandoc writes references to `js/dist/...`. The output bundle is always portable:

- Local pictures are copied under `images/`.
- With **Use remote pictures** off, every remote picture is fetched into
  `images/`; the page references only local image files.
- With **Use remote pictures** on, remote image URLs remain exactly as authored.
- With **Use remote Reveal.js resources** off, Yi fetches the Reveal.js
  distribution files referenced by the generated page into `js/dist/`.
- With **Use remote Reveal.js resources** on, the generated page retains
  Pandoc's pinned CDN URLs.
- Required downloads fail the export if the selected local mode cannot complete;
  the failure names the URL. Yi does not leave a silently partial bundle.
- Duplicate source pictures share one output file with a deterministic name.

The export card owns these two choices. They are not frontmatter settings and
do not appear for any other kind. Reveal.js never exposes the normal HTML
self-contained checkbox.

The Reveal.js asset downloader uses the app's bounded HTTP client and a pinned
Reveal.js release. Tests drive the downloader through a local HTTP fixture seam;
the production default is the pinned upstream package URL.

## Beamer

Beamer writes one PDF with `slide-level: 2` as the default presentation
structure. Talk metadata and visual behavior come from frontmatter:

- title, subtitle, author, date, institute;
- theme, colortheme, fonttheme;
- aspect ratio, navigation, section titles;
- any other Pandoc/Beamer metadata the note names.

The export card does not offer page size or orientation; those belong to
Beamer metadata rather than PDF paper geometry.

## New Note Metadata Starters

New Markdown includes two built-in choices independent of the export-template
package library:

- **Reveal.js presentation**
- **Beamer presentation**

They are represented by stable built-in ids, not template-package ids.
`newNoteTemplates()` returns them alongside readable packages that carry a
root `metadata.yaml`; `newNoteMetadata()` returns their frontmatter directly.
Templates are never read from `examples/`.

The Reveal.js starter contains representative presentation frontmatter:

```yaml
title: Presentation
subtitle:
author:
date:
id:
keywords:
  - untagged
theme: black
transition: slide
slide-level: 2
incremental: false
controls: true
progress: true
history: true
```

The Beamer starter contains:

```yaml
title: Presentation
subtitle:
author:
date:
id:
keywords:
  - untagged
institute:
theme: default
colortheme: default
fonttheme: default
aspectratio: 169
navigation: horizontal
section-titles: true
```

The existing new-note rule still supplies missing required keys and overrides
`date` and `id` with the app's stamps.

## Example Layout

Move the existing user-facing examples:

```text
test/fixtures/templates/examples/
```

to:

```text
examples/templates/
```

Add complete user-facing decks:

```text
examples/revealjs.md
examples/beamer.md
```

The Reveal.js deck demonstrates frontmatter-controlled theme, transitions,
slide level, section/slide headings, pictures, code, math, tables, citations,
and speaker notes. The Beamer deck demonstrates frontmatter-controlled theme,
colors, fonts, aspect ratio, title metadata, frames, code, math, tables,
citations, and blocks.

All paths in Documentation, agent context, checks, and probes move to
`examples/templates/`. The behavioral fixture workspace remains under
`test/fixtures/`.

## Rho Class Callouts

Keep the upstream Rho class files unchanged. Modify the package's example and
adapter:

- Replace the relevant original Note material with a Yi
  `::: {.callout .callout-note}` block.
- Add an Information block with
  `::: {.callout .callout-info title="Information"}`.
- `callout.lua` recognizes `.callout-note` and `.callout-info`, removes Yi's
  generated `.callout-title` child, and emits the Rho `note` or `info`
  environment around the converted body.
- Unrecognized callout kinds retain their title and body as ordinary content.
- Remove the `quote -> note` environment override from `template.tex`.
  Ordinary blockquotes remain ordinary quotes.
- The example still compiles through pdfLaTeX with the existing table filter,
  citation style, figures, equations, and bibliography.

## Tests

- Rust kind tests assert both writers, extensions, no-template mode, defaults
  writers, menu support, and Beamer's LaTeX-family behavior.
- Node checks cover built-in starter metadata, package/non-package separation,
  path movement, and Rho callout source.
- A Tauri probe exports a Reveal.js deck and checks the HTML, local image files,
  local Reveal.js files, and both remote-resource modes.
- A Tauri probe exports a Beamer deck with real XeLaTeX and checks the PDF,
  slide title, theme metadata, and reference compilation.
- The new-note probe checks that both built-in choices appear, selecting each
  produces the expected frontmatter, and packages with `metadata.yaml` still
  appear normally.
- The Rho check compiles the example and verifies Note and Information titles
  appear once with no duplicate callout headings.
- Header, layering, locale, documentation, and test-index checks remain green.

## Documentation

Update all eight Documentation locales and the developer context for:

- the two new export kinds;
- no template-package support;
- Reveal.js local/remote resource choices;
- Beamer frontmatter controls;
- the built-in New Markdown choices;
- the root `examples/` versus `test/fixtures/` distinction;
- the Rho Class callout adapter.

