# OpenDocument example

`reference.odt` is a binary Pandoc reference document for LibreOffice Writer. Define the named
styles you want Pandoc to carry into the exported `.odt` file.

This example is an academic dissertation reference document:

- the first page has an embedded college background and four underlined lines for author,
  institution, instructor and date;
- the second page holds the abstract and keywords;
- the third page is a two-level contents page;
- the body starts on page four with A4 heading, body, quotation, footnote, table, figure and
  bibliography styles.

Open `example.md` as a note and export it as LibreOffice with this package selected. The Markdown
uses custom styles for the cover, contents and body-start page breaks. `college-cover.svg` is the
editable source for the embedded cover; `college-cover.png` is the raster embedded in `reference.odt`.

`metadata.yaml` supplies sample note metadata, `defaults.yaml` supplies package-local settings,
`example.svg` supplies the figure and `references.bib` supplies the reference entry.

`node scripts/build-dissertation-odt.mjs` rebuilds `reference.odt` from Pandoc's default ODT
reference document while preserving every standard Pandoc style.
