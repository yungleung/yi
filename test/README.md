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
| `check-new-document.mjs` | The shape of a new note (`services/new_document.ts`): the id's fourteen digits and the local clock they read, the frontmatter built from the reader's template with the four required keys guaranteed, and the range the title's value sits in |
| `check-plain-edit.mjs` | Which edits cannot change how the text parses, and that every edit the rule accepts leaves the parse's shape unchanged (`syntax/plain_edit.ts`) |
| `check-table-edits.mjs` | Table row/column commands and alignment |
| `check-table-menu.mjs` | The table menu's model: what each entry does to the source |
| `check-table-source.mjs` | Reading and writing a table's raw source |
| `check-tag-offsets.mjs` | Which of the offsets a block's elements carry an edit moves, and that every one of them is on the moved list or exempt for a reason (`editing/typed_text.ts`) |
| `check-thematic-break.mjs` | What a rule insertion adds around the `---` line, and when it adds nothing |
| `check-text-store.mjs` | The document text as a piece table (`document/text_store.ts`): any sequence of edits must leave it holding exactly what a string holds |
| `check-tree-menu.mjs` | What the workspace tree's context menu offers for a file, a folder and the workspace itself, and which items cannot mean anything there |
| `check-tree-rules.mjs` | The tree's pure rules: what a rename starts with selected (the name, without the markdown extension) and whether a drop into a folder is allowed |
| `check-workspace-folders.mjs` | Where a new note may go (`services/workspace_folders.ts`): the order and depth of the walk, a folder that cannot be read, the folder it refuses to walk past, and the path rules the card, the tree and a system sheet's answer all read |
| `commands.mjs` | That a command has one name, one home and one way in: no module but the registry declares a command, and the editor reaches commands by name |
| `headers.mjs` | That every module under `src/ui/markdown` opens with the three-line header: what it is for, what it may import, what it upholds (`docs/writing-comments.md`) |
| `layering.mjs` | That the syntax layer imports nothing from outside itself (no DOM, no state) |
| `probe-markers.mjs` | That a probe opening the native table menu carries `@needs-foreground-window`, so `probe:all` skips it instead of leaving the menu open for every probe after it |
| `syntax-home.mjs` | That each markdown-syntax fact is defined in exactly one module |

## The probes

A hundred and fifteen of them, grouped by area: the workspace tree (`tree-rename` — a name edited
where it sits, the tree unmoved and the extension left out of the selection;
`tree-create`, `tree-file-actions`, `tree-delete` — what the context menu does;
`tree-drag`, `tree-drag-refusals` — a move that updates only the rows it touched, and the
moves that are refused; `tree-no-reload` — a change in the *fixture* workspace that leaves
the page it happened on in place), making a note (`new-markdown` — the card the menu item's
command opens: the generated id in the name field, the workspace's folders, the file written
where it was asked for with its frontmatter on screen and its title selected, and the tree's own
*New file* through the same command; `new-note-template` — a template written through the app's
config, the settings tab that shows it, and the note that comes out), blocks and spacing
(`block-gaps`, `spacing`,
`empty-*`, `insert-rule`), code and lists (`code-tab`, `code-shift-tab`, `list-*`), tables
(`table-*`), footnotes (`footnote-*` — the button, the marker's two clicks and its source,
the preview card, the label's own edits, and the shapes a definition is written in:
`footnote-containers`, `footnote-container-jump`, `footnote-table-cell`,
`footnote-repeat-label`, `footnote-labelled`, `footnote-label-undo`,
`footnote-label-rebuild`, `footnote-label-edge`), description
lists (`description-list`), the caret (`boundary-caret`, `pointer`,
`regression-arrows`, `edit-stability`, `regression-undo`, `undo-after-scroll`,
`plain-edit-offsets`, `undo-typing`, `undo-run-taken-back`, `undo-selection-return`),
what a keystroke costs (`edit-cost`, `scroll-cost`, `block-rebuild-cost`, `typed-text`,
`plain-edit-parse`, `plain-edit-markers`, `block-offset-cost`, `load-cost`,
`typing-cost-by-kind`, `code-local-write`, `keystroke-parts`, `code-markup-layout`), finding (`find-replace`),
paste (`paste-blocks`), source mode
(`display-math-*`, `math-*`, `inline-math-*`, `revealable-flows`,
`revealed-source-exit`, `reveal-click-scroll` — a click that opens a source keeps the
page where it was), links (`insert-link` — the button, the clipboard destination and the
caret in the title; `insert-link-clipboard` — a clipboard that offers no URL and one the
app cannot read at all, either way with the webview's clipboard never asked;
`link-cmd-click` — ⌘-click opens in the browser, a plain click opens the source), the
highlighted source (`source-theme` — the palette of a code block, the frontmatter and a
formula's source, measured in both themes; `source-highlight-caret` — a click in the
frontmatter, and in a code block, writes the character it was aimed at), the
documents and their stack (`document-stack` — a file opened, pushed, and the next file replacing it without a question; `document-stack-restore` — a document coming back with its caret and its view; `document-stack-ask` — the four answers the session asks about; `document-session-restart` — the session file, and the startup path that reads it), the
page (`a4-page` — 210 mm of sheet, a 25 mm margin, centred on the theme's desk, the measure
the reader gets, the smaller page a narrower pane is given instead of a sideways scroll, and
the whole rhythm coming down with it; `page-layout-toggle` — the status bar button's two
layouts, driven by pressing it), the
fixture workspace (`fixture-*`), and the real
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
- A probe whose subject is written *through the webview* — a new note is written with the file
  plugin — needs a workspace under `$HOME`, because that is all the plugin is scoped to
  (`src-tauri/capabilities/default.json`: a folder under `/private/tmp` can be listed, moved and
  deleted by the app's own Rust commands, but reading or writing it from the page is refused).
  `new-markdown.js` and `tree-create.js` make their own folder in the home directory, use
  `plugin:path|resolve_directory` for its path, and remove it in their `finally`.
- A **native** surface — the system's save sheet, a window menu, the prompt's own dialog — cannot
  be driven, and cannot be stood in for from the page either: the dialog plugin's `save` does not
  travel over the webview's `fetch` (measured; a `fetch` stand-in that works for an app command
  and for the opener never sees `plugin:dialog|save`, and the real sheet then blocks the harness
  for its whole budget). So the app gives every question two hands and a probe drives the card:
  which hand is in the room is `src/ui/under_test.ts`, one rule for the prompt, the new-note card
  and whatever comes next. A rule that only the native hand reaches belongs in a pure module with
  a check beside it — `check-workspace-folders.mjs` holds the one the new-note sheet's answer is
  read by.
- A probe is one expression returning `{ checks, failed }`; a probe that only
  measures returns its numbers. The harness reads that verdict: a probe with a
  non-empty `failed` exits non-zero, so `npm run probe:all` fails with it (it did
  not always — two probes had been failing quietly, see `docs/roadmap.md`). Use
  `t.report(...)` for progress, so a bridge timeout still yields evidence.
- Name probes for the behaviour, not the file they touch.
- A check prints `all checks passed` on success and the failures on stderr.
