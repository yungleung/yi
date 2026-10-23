# Physical Review Letters example

`template.tex` follows the source shape of the APS REVTeX 4.2 `apstemplate.tex` sample. It uses the
`revtex4-2` class with the `aps`, `prl`, `reprint`, and `superscriptaddress` options. The title,
affiliations, emails, abstract, date, and keywords all come from note metadata; no example author
or title is hard-coded in the template.

`example.md` is a complete illustrative Letter on a transition-edge search for cosmic microwave
background spectral distortions. It includes three author records, six introductory citations,
mathematical models, a vector figure, and a detector table.

The package keeps the journal source tree together:

```text
latex/
  template.tex
  example.md
  metadata.yaml
  defaults.yaml
  references.bib
  bibliography/apsrev4-2.bst
  figures/cmb-spectrum.pdf
  figures/cmb-spectrum.svg
  tools/revtex-table.lua
```

`defaults.yaml` names only the table filter and sets `cite-method: natbib`, so Pandoc leaves
citations as native `\cite` commands. `bibliography: references.bib` is the path used by the
template. Yi filters the library selected in **Settings → Citation** to the citation keys in the
note, converts CSL-JSON when needed, and writes that cited-only `.bib` into the exported source
folder. The package's own `references.bib` is an authoring sample and contains an intentionally
uncited entry for testing.

The package uses one small Lua filter, `tools/revtex-table.lua`, to turn Pandoc's portable pipe
tables into REVTeX's `table` and `ruledtabular` environments. This avoids a column-width
incompatibility between Pandoc's generated `longtable` specification and REVTeX.

The exported source can be compiled with

```sh
export BSTINPUTS=".:bibliography:"

pdflatex note.tex
bibtex note
pdflatex note.tex
pdflatex note.tex
```

Or, from the same shell, one command performs the whole sequence:

```sh
export BSTINPUTS=".:bibliography:"
latexmk -pdf -interaction=nonstopmode -halt-on-error note.tex
```

If `latexmk` reports `LaTeX didn't generate the expected log file 'note.log'`, run `pdflatex`
directly once:

```sh
/Library/TeX/texbin/pdflatex -interaction=nonstopmode -halt-on-error note.tex
```

That message means the engine did not reach normal TeX processing; it is not a template error. An
error such as `pdflatex: pdflatexNNNN.fls: Operation not permitted` means the process cannot write
to the source folder, commonly because it was launched from a restricted/sandboxed terminal or
macOS denied access to the folder. Run the command from an ordinary Terminal window with the project
folder accessible, then run `latexmk` again. If `pdflatex` succeeds and creates `note.log`, the
subsequent `latexmk` pass performs the BibTeX reruns.

The figure's SVG is the editable source; `rsvg-convert -f pdf -o figures/cmb-spectrum.pdf
figures/cmb-spectrum.svg` regenerates the vector PDF.

The example text and figure are CC0-1.0. The APS `apsrev4-2.bst` asset is redistributed under the
LaTeX Project Public License, as stated in its file header.
