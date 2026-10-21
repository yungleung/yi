# EPUB example

`template.xhtml` is a complete EPUB chapter template. The body goes inside the chapter section, and
the document supplies the title and language metadata Pandoc needs.

`assets/book.css` demonstrates a package stylesheet. Yi's EPUB packer adds package web assets under
the book's `assets/` directory, rewrites their URLs and declares them in `content.opf`.
