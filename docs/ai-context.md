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
| Syntax (pure, no DOM) | `src/ui/markdown/blocks.ts` and `src/ui/markdown/syntax/**` | split text, and the pure rules of editing |
| Document | `state.ts` | the text, its blocks, parse cache, undo history |
| Render | `virtual_block_renderer.ts`, `create_block.ts`, `registry.ts`, `create_node.ts`, `nodes/*`, `source_mode.ts`, `format*.ts` | DOM for the window of blocks |
| Caret and offsets | `caret/*`, `position.ts` | the logical caret, and mapping offsets |
| Commands | `editing/*`, `commands/*` (the registry, the native-menu bridge, the keymap), `markdown_editor.ts`, `click_routing.ts` | keys, menu, toolbar and table-menu actions — one command, one name, one way in |
| Shell | `src/ui/*` (the editor panel is `src/ui/editor_panel.ts`), `src/services/*` | the window, workspace, settings, bibliography |

`docs/architecture.md` is the same map with the data flow and a "where does this
change go?" table.

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
`position.ts: documentOffsetAt` and `domPositionAtOffset` are the two directions;
`editing/context.ts: applyEdit` and `placeCaret` are where they are used.

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

## If you are an AI agent

Before claiming a change works:

1. `npx tsc --noEmit` → silent.
2. `npm run check` → `12/12 checks passed` (or more, if you added one).
3. Run the probes that touch what you changed; if a probe fails, read
   `test/README.md` for how probes report, and check the app is freshly started —
   a dev app left running for hours gets slow and probes will time out.
4. If you changed behaviour, add or update a test that fails without your change and
   say which one proves it. Pure rules go in `test/checks/`; anything about DOM,
   caret or rendering goes in `test/probes/`.
5. Keep the house rules above; if a rule has to give, say so in the commit message.

Do not invent files or functions: every path in this document exists. If you need a
name that is not here, search with `rg` before writing.
