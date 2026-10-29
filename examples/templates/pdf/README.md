# PDF example

`template.tex` is the same Pandoc text-template contract used by the PDF kind. The package
`defaults.yaml` selects `xelatex`; the machine running Yi must therefore have XeLaTeX installed.

`example.sty` is kept at the package root while Pandoc and TeX run there. That demonstrates the
search path a journal class or style file relies on. Use **Test PDF** in the package editor to check
the complete Pandoc-to-TeX-engine path.
