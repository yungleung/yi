# Contributing

Thanks for taking the time. This is a small codebase with a strong preference for
small, well-named modules and tests that prove behaviour — human or AI, you are
welcome to work the same way.

## Setup

```bash
npm install
npm run tauri dev      # the app, with the MCP bridge on port 9223
npm run check          # pure Node checks (fast, no browser)
```

## Before you open a pull request

1. `npx tsc --noEmit` — types must be clean; the project is `strict` with
   `noUnusedLocals`.
2. `npm run check` — every pure check must pass.
3. The probes you touched — `npm run probe -- test/probes/<name>.js` with the app
   running. A behaviour change needs a probe (or a check, when the rule is pure);
   say in the pull request which one proves it.
4. Commit style: `type(scope): subject`, lower case, imperative — `fix(editor): …`,
   `test: …`, `docs: …`, `chore: …`.

## How the code is organised

`docs/architecture.md` has the layer table and the invariants. The short version: a
block is rendered from its own source, the document text is the only source of
truth, and a caret's document offset is the truth about where the caret is. The
house rules are that one fact has one home, and every module header says what it is
for and what it may import.

## Adding things

- A node type: `docs/adding-a-node.md`.
- A command: `docs/adding-a-command.md` (lands with the command registry; until then
  `registerCommandEvents` in `src/ui/markdown/markdown_editor.ts` is where commands
  are wired).
- A rule-shaped behaviour (anything that is a pure function of the text): put the
  rule in a module a check can bundle, and test it in `test/checks/`.

## The fixture workspace

`test/fixtures/workspace/` is a committed notes folder: the demo document, a small
bibliography, the notes the demo document links to, and one math-heavy and one large
note. Probes that need it are marked `@needs-workspace` in their header and are run
with `--with-workspace`. Refresh the copies from your own workspace with
`YI_FIXTURE_SOURCE=… npm run fixtures` and commit what changes.

## Reporting bugs

A failing probe is the most useful bug report this project can receive: it says what
the editor should have done, and it stays. If you cannot write one, say what you
clicked, what you expected, what happened, and in which document.
