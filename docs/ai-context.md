# AI context pack

You are an AI agent (or a person) about to work on Yi, a Tauri + TypeScript
WYSIWYG markdown editor. This is the one document to read first: it says what the
code is, the rules that must not break, and how to prove your work. If you are an
agent, treat it as your brief; if it disagrees with the code, the code wins — then
fix this file.

## What this is

A local-first notes app: a folder of markdown files is the workspace, the editor
renders it, and every edit is a plain-text edit to the file. The raw markdown is the
only source of truth; blocks are slices of it; only the blocks near the viewport are
mounted.

## Map

| Layer | Files | Job |
| --- | --- | --- |
| Syntax (pure, no DOM) | `src/ui/markdown/document/blocks.ts` and `src/ui/markdown/syntax/**` | split text, and the pure rules of editing |
| Document | `document/state.ts`, `document/blocks.ts` (the text, its blocks, the parse cache) and `document/history.ts` (the edit log) | the text and everything derived from it |
| Render | `virtual_block_renderer.ts` (the DOM), `block_sizes.ts` (the pixel arithmetic), `viewport_window.ts` (which blocks to mount), `create_block.ts`, `registry.ts`, `create_node.ts`, `nodes/*`, `source_mode.ts`, `format*.ts` | DOM for the window of blocks |
| Caret and offsets | `caret/*` — `offsets.ts` reads a rendered position back into the document, `dom_position.ts` places one from it | the logical caret, and mapping offsets |
| Commands | `editing/*`, `commands/*` (the registry, the native-menu bridge, the keymap), `markdown_editor.ts`, `click_routing.ts` | keys, menu, toolbar and table-menu actions — one command, one name, one way in |
| Shell | `src/ui/*` (the editor panel is `src/ui/editor_panel.ts`), `src/services/*` | the window, workspace, settings, bibliography |

`docs/architecture.md` is the same map with the data flow and a "where does this
change go?" table.

Two recipes cover the changes an editor like this gets most: `docs/adding-a-node.md`
for a markdown construct, and `docs/adding-a-command.md` for a name the author can
ask for. `docs/writing-comments.md` is the third page a contributor needs — the
module header every file opens with, and the voice the rest of the comments use.

## The rules

1. The document text is the only source of truth; edits are raw-text range
   replacements.
2. A block's rendering is a pure function of its own source, never of where it sits.
3. A caret's document offset is the truth; a rendered position is derived from it
   and re-derived after any rebuild.
4. Source mode is decided from the document, never by swapping an element behind the
   caret.
5. One fact about markdown syntax has one home.
6. A syntax module never imports the DOM.

## The four offsets (learn these first)

`document` (index into the raw markdown) → `block-relative` (minus
`block.charStart`) → `rendered` (index into an element's text) → `DOM range` (a live
`Range`, which the browser *relocates* rather than drops when its node is replaced).
`caret/offsets.ts: documentOffsetAt` and `caret/dom_position.ts: domPositionAtOffset`
are the two directions; `editing/context.ts: applyEdit` and `placeCaret` are where
they are used. The table in `docs/architecture.md` says what each mapping is
re-derived from, and when.

## Commands you will need

```bash
npm install
npm run tauri dev                       # the app (Tauri MCP bridge on 9223)
npx tsc --noEmit                        # types (strict, noUnusedLocals)
npm run check                           # pure checks, no browser
npm run probe -- test/probes/<name>.js  # one DOM probe, app must be running
npm run probe:all                       # probes that need no fixture workspace
npm run fixtures                        # refresh the fixture workspace
```

Setting those up — the MCP server and CLI that drive the app, and the skills this
project uses (`tauri-mcp-cli`, the official `daisyui` one) — is in `README.md`
under *AI agents*.

## If you are an AI agent

Before claiming a change works:

1. `npx tsc --noEmit` → silent.
2. `npm run check` → `15/15 checks passed` (or more, if you added one).
3. Run the probes that touch what you changed; if a probe fails, read
   `test/README.md` for how probes report, and check the app is freshly started —
   a dev app left running for hours gets slow and probes will time out.
4. If you changed behaviour, add or update a test that fails without your change and
   say which one proves it. Pure rules go in `test/checks/`; anything about DOM,
   caret or rendering goes in `test/probes/`.
5. Keep the house rules above; if a rule has to give, say so in the commit message.

Do not invent files or functions: every path in this document exists. If you need a
name that is not here, search with `rg` before writing.
