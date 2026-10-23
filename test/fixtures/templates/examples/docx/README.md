# Word example

`reference.docx` is a binary Pandoc reference document. It is the package entry and should contain
the paragraph, heading, quotation, code and caption styles you want the exported document to use.

`metadata.yaml` exercises Pandoc's document-title mapping: `title` uses **Title**, `subtitle` uses
**Subtitle**, `author` uses **Author**, `date` uses **Date**, and `abstract` uses **Abstract Title**
and **Abstract**. Those styles are what the reference document must define when a journal expects
this metadata on the first page.

`example.md` is a complete document to export with this package. It covers heading levels one
through six, title metadata, first and body paragraphs, inline formatting, links, footnotes, block
quotes, lists, fenced code, mathematics, a table, a figure and definition lists.
`example.svg` supplies the figure, and `references.bib` supplies the citation and bibliography
entry. Open the Markdown file as a note, then export it as Word with this package selected to
inspect the resulting styles.

`defaults.yaml` requests Pandoc's automatic two-level table of contents. `reference.docx` marks
fields for update when Word opens the exported document, so the contents field is populated rather
than appearing as an empty control.

Yi does not parse or edit the binary here. Select the package in the export card, then use **Open in
system** from the template editor when you need to change its styles in Word.

`node scripts/enable-docx-field-updates.mjs` re-applies the field-update setting after editing the
reference document.
