# Template package examples

Each directory is a complete package for one Yi export kind. They are deliberately small enough to
read and copy, while still using the real manifest, entry, metadata and defaults files.

| Directory | Entry | Use it to learn |
| --- | --- | --- |
| `html/` | `template.html` | Page structure, CSS and JavaScript relative to the bundle |
| `latex/` | `template.tex` | A standalone template and files delivered beside `.tex` |
| `pdf/` | `template.tex` | The same Pandoc contract with a PDF engine |
| `epub/` | `template.xhtml` | EPUB chapter markup and package assets |
| `docx/` | `reference.docx` | Word styles from a binary reference document |
| `odt/` | `reference.odt` | LibreOffice styles from a binary reference document |

Each package also has:

- `template.json`, the manifest Yi writes;
- `metadata.yaml`, sample frontmatter for a new note;
- `defaults.yaml`, package-local Pandoc settings.

Import any directory with **Export → Choose… → Import folder**. The entry names and kinds are
already arranged so inspection proposes the package without an extra choice.

These are neutral examples under CC0-1.0, not journal submission kits. Replace their titles,
metadata and styling when starting a real template.
