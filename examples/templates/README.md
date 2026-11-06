# Template package examples

Each directory is a complete package for one Yi export kind. They are deliberately small enough to
read and copy, while still using the real manifest, entry, metadata and defaults files.

| Directory | Entry | Use it to learn |
| --- | --- | --- |
| `html/` | `template.html` | A Bootstrap technical blog with a sidebar table of contents |
| `latex/` | `template.tex` | A three-author PRL/REVTeX source package with native cited-only BibTeX |
| `pdf/` | `template.tex` | The same Pandoc contract with a PDF engine |
| `rho-class/` | `template.tex` | A CC BY two-column research article with a journal class, callouts and IEEE references |
| `legrand-orange-book/` | `template.tex` | A CC BY-NC-SA illustrated book with part pages, chapter art and theorem boxes |
| `epub/` | `template.xhtml` | A three-chapter novel with cover, front matter and visible contents |
| `docx/` | `reference.docx` | Word styles from a binary reference document; `example.md` exercises all of them |
| `odt/` | `reference.odt` | An A4 dissertation with cover, abstract, two-level contents and body; `example.md` exercises it |

Each package also has:

- `template.json`, the manifest Yi writes;
- `metadata.yaml`, sample frontmatter for a new note;
- `defaults.yaml`, package-local Pandoc settings.

Import any directory with **Export → Choose… → Import folder**. The entry names and kinds are
already arranged so inspection proposes the package without an extra choice.

The original Yi examples are CC0-1.0. `rho-class/` keeps the upstream CC BY 4.0 licence and its
required `ATTRIBUTION.txt`; credit Guillermo Jimenez when redistributing or publishing with that
design. `legrand-orange-book/` keeps the upstream CC BY-NC-SA 3.0 licence and attribution; credit
Mathias Legrand and Vel. None of these are journal submission kits. Replace their titles, metadata
and styling when starting a real template.
