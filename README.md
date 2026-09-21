# Yi

A local-first notes app: a WYSIWYG markdown editor that keeps your notes as plain
markdown files in a folder you own. Built with [Tauri](https://tauri.app/) and
TypeScript — no server, no database, no account.

## What it does

- **Edits markdown as it renders.** Headings, lists, tables, quotes and code look
  like themselves; the markdown source appears where the caret is, so nothing has
  to be previewed in a second pane.
- **Notes as files.** A workspace is a folder; the tree on the left is that folder,
  and every edit is a plain-text edit to the file.
- **Links that resolve.** `[[Note]]` wikilinks resolve by heading, file name or
  frontmatter title, and render the target's title.
- **Math, footnotes and citations.** `$…$` and `$$…$$` render through KaTeX, and
  pandoc-style footnotes and citations render through CSL and a bibliography file.
- **Made for long notes.** Blocks outside the viewport are unmounted; a 320 KB note
  stays editable.

## Requirements

Node 20 or newer, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/)
for your platform (Rust stable plus the system webview libraries).

## Getting started

```bash
npm install
npm run tauri dev      # run the app
npm run check          # every test that needs no browser
```

Open a workspace with **Open folder** in the app. `test/fixtures/workspace/` is a
committed notes folder the tests use; you can open it to see the app in action.

## Testing

Both layers live in `test/`:

| Command | What it covers |
| --- | --- |
| `npm run check` | Pure Node checks: block splitting, editing rules, source-entry offsets, layering. No browser, milliseconds. |
| `npm run probe -- test/probes/<name>.js` | A probe evaluated in the running app through the Tauri MCP bridge: real clicks, real carets. Needs `npm run tauri dev` in another terminal. |
| `npm run probe:all` | Every probe that needs no fixture workspace. |
| `npm run fixtures` | Re-copies the fixture workspace from your own notes folder. |

`docs/testing.md` explains the methodology; `test/README.md` indexes the tests.

## Where things live

| Path | What it is |
| --- | --- |
| `src/ui/markdown/` | The editor: blocks, rendering, caret, offsets, commands |
| `src/ui/markdown/nodes/` | One component per markdown node type |
| `src/services/` | Workspace, documents, bibliography, settings |
| `src-tauri/` | The Rust side: window, config, file access |
| `test/` | Checks, probes, fixtures |
| `docs/` | Architecture, testing, and how to add a node type |

## Contributing

Read `CONTRIBUTING.md`, then `docs/ai-context.md` — the same pack an AI assistant
should read before touching the code. Behaviour changes need a test; the recipes in
`docs/` say which kind.

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## Licence

MIT — see `LICENSE`. The notes in `test/fixtures/workspace/` are the maintainer's own
writing, published under CC BY 4.0 (see that folder's README).
