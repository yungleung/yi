# Yi

[简体中文](README.zh-CN.md)

Yi is a local-first writing environment for notes, research and long-form
documents. It combines a WYSIWYG Markdown editor with the portability of ordinary
files: a workspace is just a folder of `.md` notes, and Yi adds rendering,
project navigation, references, citations and publishing tools without taking
ownership of the text. There is no account, server, proprietary database or
required cloud service.

The editor keeps the page readable while the exact Markdown stays close at hand.
Links, headings, tables, callouts, theorems, equations and formatted text are
rendered in place; selecting one reveals its source where the caret is, so editing
never requires a separate preview pane. The workspace tree, document search,
wikilinks, cross-references and structured frontmatter make a large collection of
notes feel like one connected document. KaTeX, CSL citations and bibliography
files cover mathematical and academic writing.

Yi can publish the same note through Word, OpenDocument, LaTeX, HTML, EPUB, PDF,
Reveal.js and Beamer. Importable Pandoc template packages control the result, and
the application remains fast on long notes by mounting only the blocks around the
viewport. Built with [Tauri](https://tauri.app/), Rust and TypeScript, Yi is a
native desktop application while the notes themselves stay portable, readable and
usable in any other Markdown tool.

## Who it is for

Yi is for researchers, academics and long-form writers who want Markdown files
they own without giving up citations, cross-references, mathematics or
publication-quality exports.

## Why Yi

- WYSIWYG editing without giving up raw Markdown
- Citations, cross-references, equations and theorem blocks
- Reusable Word, LaTeX, EPUB, HTML and PDF template packages

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

Node.js 20.19 or newer in the 20.x line, or 22.12 or newer, and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform
(Rust stable plus the system webview libraries).

An AI agent driving the app rather than editing by hand needs two more things
installed — the Tauri MCP server and the skills this project relies on. Both are
in [AI agents](#ai-agents) below.

## Getting started

```bash
npm install
npm run tauri dev      # run the app
npm run check          # pure Node checks
cargo test --manifest-path src-tauri/Cargo.toml  # Rust tests
```

Open a workspace with **Open folder** in the app. `test/fixtures/workspace/` is a
committed notes folder the tests use; you can open it to see the app in action.

## Testing

Both layers live in `test/`:

| Command | What it covers |
| --- | --- |
| `npm run check` | Pure Node checks: block splitting, editing rules, source-entry offsets, layering. No browser, milliseconds. |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Rust unit tests: files, export, fonts, settings, session, versioning and native integration. No browser. |
| `npm run probe -- test/probes/<name>.js` | A probe evaluated in the running app through the Tauri MCP bridge: real clicks, real carets. Needs `npm run tauri dev` in another terminal. |
| `npm run probe:all` | Every non-interactive probe that needs no configured workspace. Probes needing a source workspace or foreground native window are skipped. |
| `npm run fixtures` | Re-copies the fixture workspace from your own notes folder. |

`docs/testing.md` explains the methodology; `test/README.md` indexes the tests.

## Project website

The public site lives in `site/` and deploys to
<https://yungleung.github.io/yi/> through GitHub Pages.

```bash
npm run site:favicon
npm run site:social
npm run site:build
npm run site:preview
```

The build converts the current bundled English and Simplified Chinese Documentation rather than
maintaining a separate copy.

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
requires two project-specific skills, with `find-skills` as an optional discovery
helper:

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
| `src/services/` | Workspace, documents, bibliography and application services |
| `src-tauri/` | The Rust side: window, files and native integration |
| `test/` | Checks, probes, fixtures |
| `docs/` | Architecture, structure, testing, and the recipes: a node type, a command, a comment (`docs/README.md` maps them) |

## Contributing

Contributions are welcome, whether code, documentation, translations, template
packages or reproducible bug reports. Start at Yi's
[contribution page](https://github.com/yungleung/yi/contribute).

- New to the project? Browse the [good first issues](https://github.com/yungleung/yi/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22good%20first%20issue%22).
- Looking for something substantial? See the [help wanted issues](https://github.com/yungleung/yi/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22help%20wanted%22).
- Have a question or workflow to share? Join [GitHub Discussions](https://github.com/yungleung/yi/discussions).
- Ready to work on the code or documentation? Read `CONTRIBUTING.md`, then
  `docs/ai-context.md` — the same pack an AI assistant should read before touching
  the code. Behaviour changes need a test; the recipes in `docs/` say which kind.

For concrete bugs, feature proposals and template-package problems, use the
[structured issue forms](https://github.com/yungleung/yi/issues/new/choose).
This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## Licence

MIT — see `LICENSE`. The notes in `test/fixtures/workspace/` are the maintainer's own
writing, published under CC BY 4.0 (see that folder's README).
