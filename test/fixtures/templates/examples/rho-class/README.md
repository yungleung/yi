# Rho Class research article

This PDF package adapts the public **Rho Class Research Article** template by
Guillermo Jimenez. Its class, language helpers and callout environments are kept
at their upstream paths under `rho-class/`; the Pandoc template supplies the
title, author, abstract and body from Yi metadata.

The design is a 9 pt, two-sided, two-column A4 article with adjacent green
accent rules, Fira Sans headings, Fira Mono code and STIX2 mathematics. It reads
with the compact title block, tinted abstract panel, numbered uppercase sections,
journal footer and right-column references of the original.

## Files

```text
rho-class/
  template.tex
  example.md
  metadata.yaml
  defaults.yaml
  rho.bib
  ieee.csl.xml
  CSL-NOTICE.txt
  table.lua
  ATTRIBUTION.txt
  figures/sensor-residuals.pdf
  figures/sensor-residuals.svg
  rho-class/rho.cls
  rho-class/rhobabel.sty
  rho-class/rhoenvs.sty
```

`defaults.yaml` selects pdfLaTeX and the package's table filter. Yi supplies
citeproc, the bibliography selected in **Settings → Citation**, and its CSL
style. The machine must have pdfLaTeX and the standard TeX packages loaded by
`rho.cls`, including `extarticle`, `stix2`, `FiraSans`, `FiraMono`, `authblk`,
`mdframed`, `tcolorbox`, `listings` and `biblatex`.

`rho.bib` and `ieee.csl.xml` are the standalone example's sample data and numbered
style. They are package assets, not overrides applied to Yi exports. Compile
`example.md` outside Yi with those files named explicitly when reproducing the
original IEEE reference appearance.

Markdown blockquotes become the class's green **Note** callout. Fenced code,
figures, tables, footnotes, mathematics and citations use Pandoc's ordinary
Markdown output rather than template-specific syntax. `table.lua` turns the
ordinary Markdown table into a full-width `table*` because `longtable` cannot
run in this two-column class.

Use **Test PDF** in the package editor for the short Pandoc-to-pdfLaTeX path,
or export `example.md` as PDF to inspect the complete research article.

## Licence and attribution

Rho Class is CC BY 4.0, copyright Guillermo Jimenez, with Eduardo Gracidas as a
contributor. Keep `ATTRIBUTION.txt`, the source URL and the author credit when
distributing this package or publishing work based on it.

- Template: <https://latextemplates.com/template/rho-class-article/>
- Upstream source: <https://github.com/MemoJimenez/Rho-class>

`ieee.csl.xml` is distributed separately by the Citation Style Language project
under CC BY-SA 3.0. `CSL-NOTICE.txt` identifies its source and licence.
