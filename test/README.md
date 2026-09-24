# The tests

This folder holds everything that proves the editor works. `docs/testing.md` is the
methodology; this file is the index and the conventions.

## Layout

| Path | What it is |
| --- | --- |
| `checks/` | Pure Node checks, run by `npm run check` (no browser) |
| `probes/` | DOM probes, run by `npm run probe -- <probe.js>` against the running app |
| `probes/lib.js` | The helpers the harness installs into the page (`window.__t`) |
| `tauri-probe.mjs` | The harness: talks to the running app over the Tauri MCP bridge |
| `run-checks.mjs`, `run-probes.mjs` | Runners behind `npm run check` and `npm run probe:all` |
| `fixtures/workspace/` | A committed notes folder the probes can open (see its README) |

## The checks

| Check | Covers |
| --- | --- |
| `check-blocks.mjs` | How the raw document splits into blocks (`document/blocks.ts`), and empty-paragraph runs |
| `check-block-index.mjs` | Where the blocks are: the prefix sums over their lengths and line spans, across an edit inside one block and across one that changes how many there are (`document/block_index.ts`) |
| `check-block-sizes.mjs` | What a block is worth in pixels, the sums the window and the spacers are built from, and which blocks a scroll mounts |
| `check-code-edits.mjs` | Tab/Shift+Tab inside a fenced code block and a display formula |
| `check-enter.mjs` | What `Enter` inserts at a block edge and on an empty paragraph, and list rules |
| `check-footnotes.mjs` | Footnote definitions, labels and appending notes |
| `check-history.mjs` | The edit log (`document/history.ts`): what an edit inverts to, the edges of undo and redo, and that a keystroke's history is bytes rather than a document |
| `check-list-edits.mjs` | List markers, indentation and item continuation |
| `check-math-source.mjs` | Which source is shown, and where a click enters it |
| `check-plain-edit.mjs` | Which edits cannot change how the text parses, and that every edit the rule accepts leaves the parse's shape unchanged (`syntax/plain_edit.ts`) |
| `check-table-edits.mjs` | Table row/column commands and alignment |
| `check-table-menu.mjs` | The table menu's model: what each entry does to the source |
| `check-table-source.mjs` | Reading and writing a table's raw source |
| `check-tag-offsets.mjs` | Which of the offsets a block's elements carry an edit moves, and that every one of them is on the moved list or exempt for a reason (`editing/typed_text.ts`) |
| `check-thematic-break.mjs` | What a rule insertion adds around the `---` line, and when it adds nothing |
| `check-text-store.mjs` | The document text as a piece table (`document/text_store.ts`): any sequence of edits must leave it holding exactly what a string holds |
| `commands.mjs` | That a command has one name, one home and one way in: no module but the registry declares a command, and the editor reaches commands by name |
| `headers.mjs` | That every module under `src/ui/markdown` opens with the three-line header: what it is for, what it may import, what it upholds (`docs/writing-comments.md`) |
| `layering.mjs` | That the syntax layer imports nothing from outside itself (no DOM, no state) |
| `syntax-home.mjs` | That each markdown-syntax fact is defined in exactly one module |

## The probes

Seventy-six of them, grouped by area: blocks and spacing (`block-gaps`, `spacing`,
`empty-*`, `insert-rule`), code and lists (`code-tab`, `code-shift-tab`, `list-*`), tables
(`table-*`), footnotes (`footnote-*`, `footnote-source`, `footnote-preview`), the caret (`boundary-caret`, `pointer`,
`regression-arrows`, `edit-stability`, `regression-undo`, `undo-after-scroll`,
`plain-edit-offsets`, `undo-typing`),
what a keystroke costs (`edit-cost`, `scroll-cost`, `block-rebuild-cost`, `typed-text`,
`plain-edit-parse`, `block-offset-cost`), paste (`paste-blocks`), source mode
(`display-math-*`, `math-*`, `inline-math-*`, `revealable-flows`,
`revealed-source-exit`), the fixture workspace (`fixture-*`), and the real
documents (`real-doc-math`, `real-docs`).

`npm run probe:all` prints every probe's name and result as it goes, which is the
live index; the newest probes carry a header naming what they cover:

```js
/**
 * One line on what this proves.
 *
 * @covers src/ui/markdown/<file>.ts
 * @fixture test/fixtures/workspace/...      (when it needs one)
 * @needs-workspace                          (when the app must open the fixtures)
 */
```

## Conventions

- A probe header may declare what it needs: `@needs-workspace` (the app pointed at the
  fixtures: run with `--with-workspace`), `@needs-source-workspace` (the maintainer's own
  notes folder open: `probe:all` skips it), `@needs-large-document` (`probe:all` gives it
  the 323 KB fixture note; everything else gets the demo document), `@needs-foreground-window`
  (the editor window must be visible, so `probe:all` skips it).
- A probe is one expression returning `{ checks, failed }`; a probe that only
  measures returns its numbers. Use `t.report(...)` for progress, so a bridge
  timeout still yields evidence.
- Name probes for the behaviour, not the file they touch.
- A check prints `all checks passed` on success and the failures on stderr.
