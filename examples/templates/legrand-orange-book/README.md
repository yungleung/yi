# Legrand Orange Book

This PDF package adapts the no-index variant of **The Legrand Orange Book**.
It preserves the orange title page, full-width chapter images, part dividers,
margin section numbers, running heads, theorem boxes, code and admonitions.

The package keeps a table of contents. It intentionally omits the
back-of-book index and all source index commands.

## Files

```text
legrand-orange-book/
  template.tex
  example.md
  metadata.yaml
  defaults.yaml
  references.bib
  template.json
  ATTRIBUTION.txt
  assets/
    background.pdf
    chapter-head-1.pdf
    chapter-head-2.pdf
    illustration.jpg
```

`defaults.yaml` selects pdfLaTeX and makes top-level Markdown headings into
parts and the next level into chapters. The machine needs a TeX Live or MiKTeX
installation with `avant`, `mathptmx`, `tikz`, `mdframed`, `titletoc`,
`fancyhdr`, `awesomebox` and the standard `amsmath` packages.

Citations use Yi's citeproc export path and the package-local `references.bib`.
Export `example.md` as PDF, or use **Test PDF** in the template editor for the
short package check.

## Licence and attribution

The Legrand Orange Book was designed by Mathias Legrand with modifications by
Vel for LaTeXTemplates.com. Both the original design and this adapted Pandoc
package are distributed under **CC BY-NC-SA 3.0**. Keep `ATTRIBUTION.txt` with
the package and preserve the attribution when redistributing or publishing
work based on the design.

- Original design: <https://www.latextemplates.com/template/the-legrand-orange-book>
- Pandoc adaptation: <https://github.com/igormcoelho/pandoc-template-legrand-orange-book>
- Licence: <https://creativecommons.org/licenses/by-nc-sa/3.0/>
