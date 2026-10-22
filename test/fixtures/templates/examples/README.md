# Template package examples

Each directory is a complete package for one Yi export kind. They are deliberately small enough to
read and copy, while still using the real manifest, entry, metadata and defaults files.

| Directory | Entry | Use it to learn |
| --- | --- | --- |
| `html/` | `template.html` | A Bootstrap technical blog with a sidebar table of contents |
| `latex/` | `template.tex` | A standalone template and files delivered beside `.tex` |
| `pdf/` | `template.tex` | The same Pandoc contract with a PDF engine |
| `epub/` | `template.xhtml` | A three-chapter novel with cover, front matter and visible contents |
| `docx/` | `reference.docx` | Word styles from a binary reference document; `example.md` exercises all of them |
| `odt/` | `reference.odt` | An A4 dissertation with cover, abstract, two-level contents and body; `example.md` exercises it |

Each package also has:

- `template.json`, the manifest Yi writes;
- `metadata.yaml`, sample frontmatter for a new note;
- `defaults.yaml`, package-local Pandoc settings.

Import any directory with **Export → Choose… → Import folder**. The entry names and kinds are
already arranged so inspection proposes the package without an extra choice.

These are neutral examples under CC0-1.0, not journal submission kits. Replace their titles,
metadata and styling when starting a real template.
