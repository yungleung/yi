# Markdown editor architecture: clean-up, test workspace, and an AI-ready contributor guide

**Status:** implemented — P0–P4 are merged into `main` (one plan per phase under
`docs/superpowers/plans/`). Section 5 below is the design's sketch of the layout;
the subsection after it records where the tree that was built differs.
**Date:** 2026-09-21
**Audience:** the maintainer, future open-source contributors, and the AI agents either of them works with.

## 1. Why

The editor works and is unusually well commented, but it grew feature by feature:
79 TypeScript files and 10,476 lines under `src/ui/markdown`, one 530-line editor
class holding ten jobs, markdown-syntax facts repeated in five modules, six
exports nobody calls any more, tests only the maintainer can find, and a README
that is still the Tauri template.

The goal is not "smaller files". It is that **a stranger — or an AI agent working
with a stranger — can find the right module, change it, and prove the change
without breaking the caret.** That is the bar this work is measured against.

Success looks like:

1. A contributor adds a node type, a command, or a block-kind rule by following one
   written recipe, touching only the modules the recipe names.
2. `npm run check` runs every test that does not need a browser, and
   `npm run probe -- <name>` runs the ones that do, against a **fixture workspace**
   committed to the repo.
3. An AI agent given `docs/ai-context.md` can orient in one read: the layers, the
   invariants, the recipes, the commands, and the house rules.
4. Each step lands as its own small, green PR; behaviour is preserved unless this
   spec says otherwise.

## 2. How to use this document (AI agents: read this section first)

This spec is written to be executed, including by an agent with no history:

- Claims about today's code carry `path:line` evidence, so they can be re-verified
  rather than trusted.
- Every phase names its deliverables with exact paths and its acceptance test as a
  command plus an expected result.
- Terms are defined in section 4 rather than assumed.
- Where a rule has to hold across modules ("one fact has one home"), the spec states
  the rule and how it is enforced.

An agent picking this up should read section 4 (the model), then section 5 (target
layout), then the phase it was handed, and check its work with section 6. Nothing in
section 5 contradicts section 4; if it appears to, section 4 wins.

## 3. What is there today (audit)

**Layers as they exist.** `blocks.ts` splits the raw document into blocks; `state.ts`
owns the text plus a per-block parse cache; `virtual_block_renderer.ts` mounts the
window of blocks near the viewport; `create_block.ts` builds one block's element
from the registry (`registry.ts` + `create_node.ts` + `nodes/*`); `position.ts` maps
between the document and the DOM; `caret/*` owns the logical caret; `editing/*` holds
the commands; `source_mode.ts` decides when a block or node shows its raw source.

**Five problems, with evidence.**

1. **One name, two modules.** `src/ui/markdown_editor.ts` (39 lines, app-facing
   wrapper) and `src/ui/markdown/markdown_editor.ts` (530 lines, the editor). The
   latter also carries a 90-line hard-coded demo document, the keymap, the command
   subscriptions, click routing, undo/redo, the find bar and caret re-anchoring.
2. **Markdown-syntax facts live in five places.** Fences and `$$` blocks
   (`blocks.ts:250`, `code_edits.ts:19`), list markers (`blocks.ts:494`,
   `list_lines.ts:10`), what starts a block (`trailing_spaces.ts:19`), table layout
   (`table_source.ts`), source-entry rules (`source_mode.ts:112`). The drift already
   happened once: `scripts/check-enter.mjs` has failed since commit `473ecf2` because
   `editing/blank_lines.ts` stopped re-exporting `itemSubtreeEnd`.
3. **Provably dead code.** Defined and referenced nowhere in `src` or `scripts`:
   `sliceBlockTree` and `buildBlockTree` (`blocks.ts:117`, `:469`),
   `refreshCaretPosition` (`caret/caret.ts:261`), `nextNodeAfter`, `nextNodeBefore`,
   `elementBoundarySide` (`caret/dom.ts:165`, `:180`, `:232`).
4. **Undocumented singletons.** `caret/caret.ts` holds ten module-level variables;
   `lazy.ts`, `registry.ts`, `source_mode.ts` (shown range + render frame),
   `nodes/math.ts` (KaTeX cache) and `blocks.ts` (content keys) each hold module
   state. They are deliberate; nothing says "one editor per window" or when the
   lifetime ends.
5. **Command wiring uses three conventions.** Toolbar and table menu go through the
   Tauri event bus (`services/event_manager.ts`) with names defined by the producer
   module (`FORMATTING_COMMAND`, `LIST_COMMAND`, `TABLE_COMMAND`, `TABLE_INSERT`,
   `FOOTNOTE_COMMAND`); native-menu commands arrive as bare string literals inside
   the editor (`'undo'`, `'redo'`, `'cut'`, `'select_all'`, `'find'`, `'replace'`).
   One command touches three files and invents a name in one of them.

**Tests as they exist.** 10 `scripts/check-*.mjs` (pure modules, bundled by
rolldown, run in Node) and 60 `scripts/probes/*.js` driven through the Tauri MCP
bridge by `scripts/tauri-probe.mjs`. Excellent coverage, no front door: no
`npm test`, no index, no CI, and the probes expect the maintainer's own workspace to
be open in the app.

**Open-source gaps.** `README.md` is the Tauri template; no `LICENSE`,
`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `.github/` or `docs/architecture.md`.
`docs/superpowers/` already holds three specs and four plans, an asset to formalise.

## 4. Model and vocabulary

- **Document** — the raw markdown string. Single source of truth.
- **Block** — a slice of consecutive lines the renderer treats as one unit
  (`frontmatter`, `fencedCode`, `displayMath`, `paragraph`, ...), described by a line
  range and a character range.
- **Node component** — the DOM component for one mdast node inside a block
  (`nodes/*`), created by the registry.
- **Offset flavours** — four, and every mapping bug in this codebase has been a
  confusion between them:
  1. **document offset** — an index into the raw markdown;
  2. **block-relative offset** — a document offset minus `block.charStart`;
  3. **rendered offset** — an index into an element's text;
  4. **DOM range** — a live `Range` in the rendered tree, anchored to a text node or
     to an element, which the browser silently relocates when the node it points
     into is replaced.
- **Source mode** — a block or node rendered as its own markdown while the caret is
  inside it (`source_mode.ts`): the shape an inline code span or fenced code block
  always has.
- **Fixture workspace** — a committed folder shaped like a user's notes folder, which
  the app is pointed at during tests (section 6).

**Invariants that must survive the refactor** (each is true today; this work keeps
them true and writes them down):

1. The document text is the only source of truth; every edit is a raw-text range
   replacement.
2. A block's rendering is a pure function of its own source, never of where it sits,
   so caches key on content rather than line numbers.
3. A caret's document offset is the truth; a rendered position is derived from it and
   re-derived after any DOM rebuild.
4. Source mode is decided from the document (which source the caret offset is inside),
   never by swapping an element behind the caret.
5. One fact about markdown syntax has one home.

## 5. Target layout

```
src/ui/editor_panel.ts            renamed wrapper: the app-facing component
src/ui/markdown/
  editor_shell.ts                 element wiring, listeners, focus
  keymap.ts                       keydown -> command id
  click_routing.ts                task boxes, footnotes, tables, pointer clicks
  commands/
    registry.ts                   the one command table (id, run, when)
    clipboard.ts text.ts formatting.ts lists.ts code.ts table.ts footnotes.ts
    find_bar.ts find_controller.ts
  document/
    state.ts history.ts blocks.ts
  syntax/                         pure, DOM-free, Node-testable
    lines.ts blank_lines.ts list_markers.ts fences.ts trailing_spaces.ts
    table_syntax.ts code_indent.ts
  render/
    virtual_block_renderer.ts block_sizes.ts viewport_window.ts
    create_block.ts registry.ts create_node.ts source_mode.ts
    format.ts format_dom.ts nodes/
  caret/
    caret.ts navigation.ts geometry.ts dom.ts observer.ts
    offsets.ts                    rendered <-> raw mapping (from position.ts)
    dom_position.ts               document offset -> DOM position
test/
  README.md                       methodology plus an index of every test
  checks/                         *.mjs, pure, run by `npm run check`
  probes/                         *.js, run by `npm run probe -- <name>`
  fixtures/workspace/             the test workspace (section 6)
  run-checks.mjs run-probes.mjs
docs/
  architecture.md                 layers, invariants, "where does this go?"
  ai-context.md                   the AI context pack (section 7)
  testing.md                      methodology, fixtures, how to add a test
  adding-a-node.md  adding-a-command.md
```

Rules, and how each is enforced:

| Rule | Enforced by |
| --- | --- |
| `syntax/` imports only other `syntax/` modules: no DOM, no state | `test/checks/layering.mjs`, an import scan |
| `document/` may import `syntax/`; `render/` may import both; `syntax/` imports neither | the same check |
| One fact about markdown syntax has one home | review, plus the same-rule list in `docs/architecture.md` |
| Every module header states responsibility, allowed imports, and the invariant it upholds | review, plus `test/checks/headers.mjs` |
| A command is registered in exactly one place | `test/checks/commands.mjs`, ids unique and reachable |

### 5.1 As built (2026-09-22)

What the phases landed, where it differs from the sketch above — every difference
is a name or a folder, not a boundary:

| Sketch | As built |
| --- | --- |
| `editor_shell.ts` | `src/ui/editor_panel.ts` (the wrapper the shell mounts) and `markdown/markdown_editor.ts` (the editor). The shell split moved the editor's listeners and focus handling to `markdown_editor.ts` and the clicks to `click_routing.ts`, so a third name for the same file was not needed. |
| `keymap.ts` at the top | `commands/keymap.ts`, beside the registry it names ids from |
| `document/state.ts history.ts blocks.ts` | Flat: `state.ts` (which owns the undo history today), `blocks.ts`. No phase's acceptance asked for the folder, so the files were not moved for the sake of the drawing. |
| `syntax/lines.ts blank_lines.ts list_markers.ts fences.ts trailing_spaces.ts table_syntax.ts code_indent.ts` | `syntax/lines.ts`, `blank_lines.ts`, `markers.ts` (fences, frontmatter delimiters, list markers and delimiter lines in one home, rather than three files that each held part of a rule), `trailing_spaces.ts`, `table_source.ts`, `table_edits.ts`, `list_edits.ts`, `code_edits.ts`, `edit_range.ts`, `empty_items.ts`, `footnotes.ts`, `parser.ts` |
| `render/*` as a folder | Flat: `virtual_block_renderer.ts`, `block_sizes.ts`, `viewport_window.ts`, `create_block.ts`, `registry.ts`, `create_node.ts`, `source_mode.ts`, `format.ts`, `format_dom.ts`, `lazy.ts`, `nodes/` |
| `commands/clipboard.ts text.ts formatting.ts …` | The rules stayed in `editing/` (where the editing context lives); `commands/` holds the registry, the keymap, the native-menu bridge and the editor's own command table (`editor_commands.ts`) |
| — | `commands/editor_commands.ts`: the command ids this editor registers, one per command (P4's follow-up) |
| — | Checks the phases added beyond this sketch: `commands.mjs`, `headers.mjs`, `check-block-sizes.mjs`, `check-thematic-break.mjs` |

## 6. The test workspace and the testing methodology

### 6.1 Fixtures

`test/fixtures/workspace/` is a notes folder the app can open:

```
test/fixtures/workspace/
  default-document.md      the old DEFAULT_MARKDOWN, verbatim: demo and default doc
  zotero.bib               the bibliography the app loads (2 entries today)
  notes/
    Unfiled/虚无与生发.md
    Game Theory/6 Bayesian Game.md
    Essays/Language and Thought.md
    Physics/Theoretic Mechanics/Geometric and Kinematic
      Foundations of Lagrangian Mechanics.md    23 KB, math-heavy
    Western Philosophy/Hannah Arendt/The Human Condition.md   323 KB, large
  README.md                what each file is for, provenance, licence
```

- `default-document.md` is the app's demo document (shown when no file is open) and
  the probes' default document; it is loaded from the fixture at build time, so it can
  be edited without touching code.
- The wikilink notes are the targets named in that document: two resolved by title
  (`虚无与生发`, `Language and Thought`), one by name (`6 Bayesian Game`), one by
  frontmatter id (`20221031105857`). The plan adds the note carrying that id, or
  points the document at a note that has one.
- `test/fixtures/refresh.mjs` re-copies the fixtures from the maintainer's workspace
  (`YI_FIXTURE_SOURCE`, default `~/Documents/ZettlrNotes`); the committed copies are
  what tests read.
- A probe can load any fixture by path (`--fixture notes/...`, or
  `t.loadFixture('notes/...')`), and the harness can point the app's config
  (`workspace`, `bibliography_file`) at the fixture folder for the run.

**Decision (agreed):** the fixtures are committed, including the two personal notes —
they are the maintainer's own writing, and the fixtures exist so that tests run against
real documents. `test/fixtures/workspace/README.md` records, for each file, where it
came from and under which licence it is published (code: MIT; the fixture notes'
content: the maintainer's own writing, published under CC BY 4.0). The refresh script
keeps the copies in step with the source workspace.

### 6.2 Methodology: three layers

1. **Pure checks** (`test/checks/*.mjs`) bundle one module with rolldown and assert on
   it in Node: no browser, milliseconds. Everything rule-shaped belongs here — block
   splitting, code/list/table edits, source-entry offsets, the layering and header
   scans.
2. **DOM probes** (`test/probes/*.js`) are evaluated in the running app through the
   Tauri MCP bridge (`test/tauri-probe.mjs`, today's `scripts/tauri-probe.mjs`). A
   probe is a single expression returning `{ checks, failed }`; it uses the installed
   helpers (`window.__t`: `load`, `loadFixture`, `click`, `key`, `raw`, `blocks`,
   `caretRect`, `report`) and reports progress through `t.report`, so a bridge timeout
   still yields partial evidence. Probes for default-document cases run one per page
   load; the harness reloads between runs when asked.
3. **Manual UI review** for anything visual: the maintainer looks at the app, driven
   through the Tauri MCP server, as `AGENTS.md` already requires.

`test/README.md` is the index: one line per check and probe saying what it covers and
which fixture it needs. `npm run check` runs layer 1; `npm run probe -- <name>` runs
one probe; `npm run probe:all` runs the ones that need no fixture workspace. CI runs
`tsc --noEmit` and `npm run check` only; probes stay local and documented, because
they need a window and a bridge.

## 7. The AI-ready contributor guide

Three artefacts, written for an agent to read cold:

1. **`docs/ai-context.md`** — the context pack: the repo map (the layer table from
   section 5), the five invariants, the four offset flavours with one example each, the
   commands (`npm run check`, `npm run probe -- <name>`, `npm run tauri dev`), the
   three recipes, the house rules, and an explicit "if you are an AI, verify with ..."
   section. `AGENTS.md` links to it and repeats the verification commands, so any agent
   that starts from `AGENTS.md` is one hop from everything.
2. **`docs/architecture.md`** — the human-facing version: the layer diagram, the
   block/caret/source-mode data flow, the invariants, and a "where does this change
   go?" decision table.
3. **`docs/adding-a-node.md`** and **`docs/adding-a-command.md`** — the recipes, each a
   numbered list of exact files with a short code sketch, ending in the command that
   proves it. The recipes are the acceptance test for section 5's rules: an agent
   following one should not need to read anything else.

Every module header takes the same three-line shape, so humans and agents can orient
from file headers alone:

```ts
/**
 * What this module is for, in one sentence.
 *
 * May import: <layers>. Upholds: <invariant>.
 */
```

## 8. Phases

Each phase preserves behaviour, lands as its own PR, and ends green.

- **P0 — safety net, fixtures, docs skeleton.** Extract `DEFAULT_MARKDOWN` into
  `test/fixtures/workspace/default-document.md` and load it; create the fixture
  workspace (notes, bibliography, refresh script, README); move checks and probes into
  `test/` with `run-checks.mjs`, `run-probes.mjs` and the `test/README.md` index; add
  `npm run check`; add CI running `tsc --noEmit` and `npm run check`; write `README.md`,
  `LICENSE` (MIT), `CONTRIBUTING.md`, `docs/architecture.md`, `docs/ai-context.md`,
  `docs/testing.md`, `docs/adding-a-node.md`; delete the six proven-dead exports; repair `check-enter.mjs`.
  Acceptance: `npm run check` green; the app starts on the fixture demo document; a
  probe loads the math-heavy and large fixtures and reports sane block counts; every
  command in the docs runs as written.
- **P1 — `syntax/` core.** Move the duplicated facts there (`lines`, `blank_lines`,
  `list_markers`, `fences`, `trailing_spaces`, `table_syntax`, `code_indent`), keep the
  existing function names, update importers, add the layering check. Acceptance: the
  one-fact-one-home list in `docs/architecture.md` names a single module for every
  rule; every existing check passes unchanged; the probes for code, math, list and
  table editing are green.
- **P2 — command registry and shell split.** One command table in
  `markdown/commands/registry.ts` (id, run, availability) that the keymap, the toolbars
  and the native-menu events all resolve through; extract `keymap.ts`,
  `click_routing.ts` and the shell; rename the wrapper to `src/ui/editor_panel.ts`.
  Acceptance: `docs/adding-a-command.md` followed verbatim adds one command in one file
  plus a registration line; `test/checks/commands.mjs` asserts unique, reachable ids;
  the probe suite is green.
- **P3 — caret and offsets.** Split `position.ts` into `caret/offsets.ts` and
  `caret/dom_position.ts`; write the offset invariant into `docs/architecture.md`;
  document, or convert to an instance, the caret's module state. Acceptance:
  `boundary-caret`, `regression-arrows`, `empty-line-editing`, `display-math-arrows`,
  `inline-math-source` and `revealable-flows` probes green; the invariant section states
  what maps to what, and when each mapping is re-derived.
- **P4 — render polish and extension contract.** Split the renderer's height and window
  arithmetic (`block_sizes.ts`, `viewport_window.ts`); make the `registry.ts` +
  `source_mode.ts` extension contract explicit in `docs/architecture.md`; land
  `test/checks/headers.mjs` now that the module moves have settled, so the three-line
  header convention from section 7 is enforced. Acceptance: the header check passes on
  the whole `src/ui/markdown` tree; the extension contract names, for each extension
  point, the file that owns it; probes green. (`docs/adding-a-node.md` is written in P0,
  where the node contract is already stable; P2 writes `docs/adding-a-command.md` once
  the command registry exists.)

## 9. Non-goals

- No new editor features, and no visual redesign.
- No framework change (no React or Vue) and no new runtime dependency; dev-only test
  tooling is fine.
- No rewrite of the virtualisation algorithm or of the block model.
- No Rust changes beyond what the fixture config needs.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Caret or offset regressions while restructuring | Probes are the safety net; P0 lands first; each phase green |
| Fixture notes are private | Review gate on 6.1; provenance and licence recorded; a refresh script instead of hand copies |
| CI red because a check needs a browser | Layer split (6.2): CI runs pure checks only |
| The refactor collides with feature work | Small PRs, `main` stays green, one phase per PR |
| Docs drift from the code | Recipes are tested by following them; the layering and header checks keep module contracts honest |

## 11. Decisions taken at review

1. **Fixture publication** (6.1): the notes are committed, with provenance and licence
   recorded in `test/fixtures/workspace/README.md`.
2. **Licence**: MIT for the code; the fixture notes' content licence is recorded
   separately in the fixtures README (CC BY 4.0).
3. **Test home**: `test/` — checks, probes, fixtures and the runner all move there.
