# Literary EPUB example

This package is a complete reflowable EPUB 3 novel. `template.xhtml` uses Pandoc's three page
modes: `coverpage`, `titlepage`, and an ordinary chapter.

- The cover page uses the book title, author and publisher metadata with a small vector illustration.
  `assets/cover.svg` is also supplied through `epub-cover-image` for the reader's library image.
- The title page carries the press, edition, title, subtitle and author.
- The following copyright page carries the ISBN, rights and fiction notice, and the dedication page
  carries the book's dedication.
- `defaults.yaml` puts Pandoc's Table of Contents document in the reading spine. Its links are built
  from the three level-one chapter headings, so each entry jumps to the matching chapter.
- `assets/book.css` is declared as Pandoc's book stylesheet, which styles both the chapter pages and
  the visible contents page. Every style travels inside the EPUB; it needs no network or web runtime.

`example.md` is the three-chapter novel *The Animal Between Us*. `metadata.yaml` demonstrates the
frontmatter a new book in this style would start from. Replace the cover SVG when changing the title
or author, because the library image cannot carry live template variables.
