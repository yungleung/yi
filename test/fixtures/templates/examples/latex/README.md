# LaTeX example

`template.tex` is a standalone Pandoc template for the `latex` export kind. It defines a title,
optional table of contents, highlighted code support and the `$body$` insertion point.

`example.sty` and `references.bst` are package assets. They are also listed in the manifest's
`deliver` array, so Yi copies them beside the exported `.tex` file. Separate documents within the
package work too: `assets` and `deliver` can name `/`-separated relative paths.
