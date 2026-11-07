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
  theorem-styles.sty
  callout.lua
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

## Semantic callouts

The package-local `callout.lua` keeps Yi's callout syntax portable and maps it
to the `awesomebox` environments the template already loads:

| Yi kind | LaTeX environment |
| --- | --- |
| Note | `noteblock` |
| Tip | `tipblock` |
| Important | `importantblock` |
| Warning | `warningblock` |
| Caution | `cautionblock` |

Write a GitHub-style callout in the note:

```markdown
> [!IMPORTANT]
> The orange accent marks a structural relationship.
```

Yi lowers this to one semantic Div before Pandoc runs, and `callout.lua`
rewrites that Div for this template. The generated title is omitted because
the box supplies its own icon and heading. A custom title remains in the box as
a bold lead-in; other callout kinds are left for a template author to handle.

## Theorem kinds and styles

Yi owns theorem environment and counter declarations. This package owns their
appearance in `theorem-styles.sty`, which is loaded before `$header-includes$`.
The file defines `legrand-plain`, `legrand-definition` and `legrand-remark`,
then attaches the Legrand boxes and remark treatment to Yi's `Theorem`,
`Definition`, `Corollary`, `Exercise` and `Remark` environments.

The example declares each non-built-in kind in frontmatter. `Theorem` and
`proof` are Yi's only built-ins. To add another kind, give it a style group and
declare the style request:

```yaml
amsthm:
  styles:
    legrand-definition: {}
  legrand-definition:
    - Definition
    - Assumption
    - Axiom
```

Then use a normal theorem Div:

```markdown
::: {#ax:choice .Axiom info="Choice"}
Every vector space has a basis.
:::
```

If a template defines the named style before `$header-includes$`, Yi preserves
it. Otherwise Yi creates a guarded fallback from the note's style settings.
Write the style inline or in a separate `.sty` file; both use the same contract.

## Licence and attribution

The Legrand Orange Book was designed by Mathias Legrand with modifications by
Vel for LaTeXTemplates.com. Both the original design and this adapted Pandoc
package are distributed under **CC BY-NC-SA 3.0**. Keep `ATTRIBUTION.txt` with
the package and preserve the attribution when redistributing or publishing
work based on the design.

- Original design: <https://www.latextemplates.com/template/the-legrand-orange-book>
- Pandoc adaptation: <https://github.com/igormcoelho/pandoc-template-legrand-orange-book>
- Licence: <https://creativecommons.org/licenses/by-nc-sa/3.0/>
