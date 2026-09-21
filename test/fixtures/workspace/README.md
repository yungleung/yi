# The fixture workspace

This folder is a notes folder, shaped like the one the app expects, so tests can
open real documents instead of inventing strings. Nothing here is loaded unless a
test asks for it.

| Path | What it is for |
| --- | --- |
| `default-document.md` | The document the editor starts on, and the one probes mean by "the default document". Edit this file to change the demo; no code needs to know. |
| `zotero.bib` | The bibliography the app loads. Two entries, enough for `[@Abel2024]` in the demo document to resolve. |
| `notes/Unfiled/虚无与生发.md` | A wikilink target resolved by its heading 1 (`[[虚无与生发]]`). |
| `notes/Unfiled/20221031105857.md` | A wikilink target resolved by frontmatter id (`[[20221031105857]]`). |
| `notes/Game Theory/6 Bayesian Game.md` | A wikilink target resolved by file name (`[[6 Bayesian Game]]`). |
| `notes/Essays/Language and Thought.md` | A wikilink target resolved by its frontmatter title (`[[Language and Thought]]`). |
| `notes/Physics/Theoretic Mechanics/Geometric and Kinematic Foundations of Lagrangian Mechanics.md` | The math-heavy note: many display formulas, the case KaTeX rendering is measured against. |
| `notes/Western Philosophy/Hannah Arendt/The Human Condition.md` | The large note, 323 KB: the case the virtualised renderer is measured against. |

## Provenance and licence

The notes are the maintainer's own writing (essays and study notes), copied from a
private [Zettlr](https://www.zettlr.com/) workspace. They are published here so that
the tests can run against documents that look like real work.

- Code in this repository: MIT (see `LICENSE`).
- The content of `notes/` and `zotero.bib`: the maintainer's own writing, published
  under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The bibliography
  entries are references to published works, as any bibliography is.

## Refreshing the copies

The committed files are what tests read; they do not change unless someone runs:

```bash
YI_FIXTURE_SOURCE="$HOME/Documents/ZettlrNotes" npm run fixtures
```

`test/fixtures/refresh.mjs` copies exactly the files listed above from that source
workspace and fails loudly if one is missing. Keep the two in step: when a note the
fixtures use changes in the source workspace, refresh and commit the new copy.
