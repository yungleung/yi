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
- **Settings that save themselves.** Text fields save after a short pause or when
  you leave them; choices and switches save immediately. Appearance can follow
  the system or use Light or Dark.
- **A tutorial on first start.** A fresh install opens a read-only tour in its own
  language; **Help → Open Tutorial** brings it back at any time.

## Requirements

Node 20 or newer, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/)
for your platform (Rust stable plus the system webview libraries).

An AI agent driving the app rather than editing by hand needs two more things
installed — the Tauri MCP server and the skills this project relies on. Both are
in [AI agents](#ai-agents) below.

## Getting started

```bash
npm install
npm run tauri dev      # run the app
npm run check          # every test that needs no browser
```

Open a workspace with **Open folder** in the app. `test/fixtures/workspace/` is a
committed notes folder the tests use; you can open it to see the app in action.

## Settings

Settings has no Save button. Changes are persisted as they are made: text fields
such as the image folder and bibliography path save after a short pause or on
blur, while selects, switches and appearance choices save immediately.

**General → Appearance** offers **Auto**, **Light** and **Dark**. Auto follows the
operating system's current preference; Light and Dark are fixed. The choice
applies to both the main window and the Settings window.

**New Note** edits the default frontmatter in the same CodeMirror YAML editor used
by template management. Edits autosave, and **Reset** restores and persists the
app-owned default.

## Testing

Both layers live in `test/`:

| Command | What it covers |
| --- | --- |
| `npm run check` | Pure Node checks: block splitting, editing rules, source-entry offsets, layering. No browser, milliseconds. |
| `npm run probe -- test/probes/<name>.js` | A probe evaluated in the running app through the Tauri MCP bridge: real clicks, real carets. Needs `npm run tauri dev` in another terminal. |
| `npm run probe:all` | Every probe that needs no fixture workspace. |
| `npm run fixtures` | Re-copies the fixture workspace from your own notes folder. |

`docs/testing.md` explains the methodology; `test/README.md` indexes the tests.

## AI agents

An agent works on this repository the way a person does — the running app, the
checks, the probes — and four pages are written for it: `AGENTS.md` (the house
rules), `docs/ai-context.md` (read this one first), `docs/structure.md` (the tree,
the class families, and what each check enforces) and `docs/writing-comments.md`
(the conventions every module follows). `docs/README.md` maps the rest. What has to
be installed is below.

### The Tauri MCP bridge

The dev build registers the
[MCP Bridge plugin](https://crates.io/crates/tauri-plugin-mcp-bridge) for Tauri, in
debug builds only (`src-tauri/src/lib.rs`). It listens on **0.0.0.0:9223**, and it
is how `npm run probe` reaches the running app — real clicks, real carets, the raw
text, screenshots, IPC inspection — instead of driving a browser.

The agent side is the
[MCP Server for Tauri](https://github.com/hypothesi/mcp-server-tauri) (by
`hypothesi`), which speaks to the app through that bridge. Its CLI is `tauri-mcp`
— `driver-session start --port 9223`, `webview-screenshot`, `webview-interact`,
`webview-execute-js`, `ipc-monitor` — and the plugin's API docs are at
[docs.rs/tauri-plugin-mcp-bridge](https://docs.rs/tauri-plugin-mcp-bridge).

```bash
npm run tauri dev                       # terminal 1: the app, bridge on 9223
npm run probe -- test/probes/pointer.js # terminal 2: a probe through it
```

The bridge is a debug-only door into the app's IPC and its windows, and it binds
every interface by default — which is what makes driving a device over the network
possible, and why it is not in a release build. To narrow it to this machine:
`tauri_plugin_mcp_bridge::Builder::new().bind_address("127.0.0.1")`.

### Skills

Skills are instructions an agent loads on demand. They are *not* committed here —
`.agents` is in `.gitignore` — so every machine installs its own. This project
relies on three:

| Skill | What it is for | Where it comes from |
| --- | --- | --- |
| `tauri-mcp-cli` | Driving the running app from the terminal: driver sessions, screenshots, clicks, keyboard, IPC capture | the [MCP Server for Tauri](https://github.com/hypothesi/mcp-server-tauri) project |
| `daisyui` (with `usage`, `colors`, `config`, `install`, `components`) | The official daisyUI 5 skill. This app's UI is daisyUI (`package.json`, `src/styles.css`), and the skill is mandatory before writing any daisyUI class name | published at <https://daisyui.com/SKILL.md>; the library is at <https://daisyui.com/> |
| `find-skills` | Finding another one when you need it | the skills ecosystem, <https://skills.sh/> |

Install them with the skills CLI, or by copying a skill folder into the directory
your agent loads skills from:

```bash
npx skills find daisyui      # search the registry (https://skills.sh/)
npx skills add <package>     # install one
npx skills update            # keep the installed ones current
```

Agents that read skills from a directory of their own — Codex reads
`$CODEX_HOME/skills` — take a copy of the skill folder there; an agent that reads
`.agents/skills/` uses this checkout's copies in place. Each skill states what it
is for and when it applies at the top of its own `SKILL.md`.

## Where things live

| Path | What it is |
| --- | --- |
| `src/ui/markdown/` | The editor: blocks, rendering, caret, offsets, commands |
| `src/ui/markdown/nodes/` | One component per markdown node type |
| `src/services/` | Workspace, documents, bibliography, settings |
| `src-tauri/` | The Rust side: window, config, file access |
| `test/` | Checks, probes, fixtures |
| `docs/` | Architecture, structure, testing, and the recipes: a node type, a command, a comment (`docs/README.md` maps them) |

## Contributing

Read `CONTRIBUTING.md`, then `docs/ai-context.md` — the same pack an AI assistant
should read before touching the code. Behaviour changes need a test; the recipes in
`docs/` say which kind.

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## Licence

MIT — see `LICENSE`. The notes in `test/fixtures/workspace/` are the maintainer's own
writing, published under CC BY 4.0 (see that folder's README).
