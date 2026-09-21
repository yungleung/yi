# Markdown editor clean-up, P4 (render polish, extension contract, headers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P4 is the last phase, so it is the one that makes the map trustworthy: the
renderer's height and window arithmetic become two modules a check can bundle,
`docs/architecture.md` says which file owns each extension point, and
`test/checks/headers.mjs` enforces the three-line header on the whole
`src/ui/markdown` tree.

**Architecture:** `virtual_block_renderer.ts` keeps the DOM and the reconciliation and
stops doing arithmetic. `block_sizes.ts` owns what a block is worth in pixels
(estimated, then remembered by content key) and the sums over a document;
`viewport_window.ts` owns which blocks those sums say to mount, and how big the two
spacers are. Both are pure enough to bundle in Node, so the arithmetic gets a check
instead of a probe.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** `docs/superpowers/specs/2026-09-21-markdown-editor-architecture-design.md`
(section 5 layout and enforcement table, section 7 header shape, section 8 P4)

## Global Constraints

- **Behaviour is preserved.** Every pixel the renderer puts on screen stays where it
  is: the same window for the same scroll position, the same estimate for an
  unmeasured block, the same spare cache.
- `npx tsc --noEmit` stays silent throughout; `npm run check` is green at the start
  and the end of the phase, and red in the middle on purpose (the header check lands
  as the to-do list, as P2's did).
- `npm run probe:all` keeps its count (59/59 passing, 6 skipped) from a freshly started
  app.
- Commit style: `refactor(render): …`, `docs: …`, `test: …`.

## What is where today

`src/ui/markdown/virtual_block_renderer.ts` (481 lines) holds, in this order:

| Part | Terms | Goes to |
| --- | --- | --- |
| `LINE_HEIGHT`, `PARAGRAPH_SKIP`, `BLOCK_GAP`, `estimateHeight` | what a block is worth before it is measured | `block_sizes.ts` |
| the `heights` map, `rememberHeight`, `heightOf`, `totalHeight`, `offsetOf` | what it is worth after | `block_sizes.ts` (a `BlockSizes` instance) |
| `VIEWPORT_MARGIN`, `MIN_SPARE_ELEMENTS`, `windowRange`, the spacer arithmetic in `updateSpacers` | which blocks to mount, and the two spacer heights | `viewport_window.ts` (pure functions) |
| everything else — `render`, `syncWindow`, `reconcile`, the spare cache, the DOM | the renderer | stays |

The header measurement that sizes Tasks 3–7: **four of the 86 modules under
`src/ui/markdown` carry `May import:` / `Upholds:` today** (`syntax/markers.ts`,
`caret/caret.ts`, `caret/offsets.ts`, `caret/dom_position.ts`).

---

## Tasks

### Task 1: The renderer's arithmetic, in two modules and a check

**Files:**
- Create: `src/ui/markdown/block_sizes.ts`, `src/ui/markdown/viewport_window.ts`, `test/checks/check-block-sizes.mjs`
- Modify: `src/ui/markdown/virtual_block_renderer.ts`

**Interfaces:**

- Produces: `LINE_HEIGHT`, `PARAGRAPH_SKIP`, `BLOCK_GAP`, `estimateHeight(block)`, and
  `class BlockSizes` — `constructor(key: (block: MarkdownBlock) => string)`,
  `heightOf(block): number`, `remember(block, height: number): void`,
  `totalHeight(blocks: readonly MarkdownBlock[]): number`,
  `offsetOf(blocks: readonly MarkdownBlock[], index: number): number`.
- Produces: `VIEWPORT_MARGIN`, `MIN_SPARE_ELEMENTS`,
  `windowRange(sizes: BlockSizes, blocks: readonly MarkdownBlock[], scrollTop: number, viewportHeight: number): [number, number]`,
  `spacerHeights(sizes: BlockSizes, blocks: readonly MarkdownBlock[], range: { first: number; last: number }): { top: number; bottom: number }`.
- Consumes: `MarkdownBlock` (type only) from `blocks.ts`.

- [ ] **Step 1: Write the check (RED)**

`test/checks/check-block-sizes.mjs` bundles the two new modules with rolldown, the way
every check loads its subject, and asserts the arithmetic. The blocks can be plain
objects (`{ text: 'a\n', lineStart: 1 }`), because the two modules only read the
source and the key:

```js
const block = (text) => ({ text, lineStart: 1 });
const sizes = new BlockSizes((block) => block.text);
const blocks = [block('a\n'), block('b\nc\n'), block('d')];
// A block's source splits on its newlines, so a trailing one is an empty line —
// the estimate the renderer already uses, and the check pins it.
check('a block is its lines plus the paragraph skip', sizes.heightOf(blocks[1]), 3 * 24 + 8);
sizes.remember(blocks[0], 100);
check('a remembered height wins over the estimate', sizes.heightOf(blocks[0]), 100);
check('the document is its blocks', sizes.totalHeight(blocks), 100 + 80 + 32);
check('a block starts where the ones above end', sizes.offsetOf(blocks, 2), 180);
check('the window starts at the block the margin reaches', windowRange(sizes, blocks, 0, 100), [0, 2]);
const spacers = spacerHeights(sizes, blocks, { first: 1, last: 1 });
check('the spacers account for every block', spacers.top + 80 + spacers.bottom, 212);
```

Run it: it fails on the import, because neither module exists.

- [ ] **Step 2: Write `block_sizes.ts`**

Move the code; do not rewrite it. The estimate, the `BLOCK_GAP` note and the reason
the heights are remembered at all ("A heavy block therefore entered the window at 60px
and took its real height a frame later, which moves everything below it") are the
*why* of these numbers and belong above them:

```ts
/**
 * What a block is worth in pixels: its estimate before it is measured, its real
 * height after, and the sums the window and the spacers are built from.
 *
 * May import: the block model (`blocks.ts`). Upholds: a block's height is a
 * function of its own source, remembered under its content key — so an edit above
 * it cannot invalidate it, and a rebuild cannot lose it.
 */
```

- [ ] **Step 3: Write `viewport_window.ts`**

```ts
/**
 * Which blocks to mount for a scroll position, and how big the two spacers that
 * stand in for the rest are.
 *
 * May import: the block model and the size arithmetic (`blocks.ts`,
 * `block_sizes.ts`). Upholds: the mounted window and the spacers always account for
 * the whole document — the scrollbar is a function of the same heights the window is.
 */
```

- [ ] **Step 4: Point the renderer at them**

`VirtualBlockRenderer` keeps a
`private readonly sizes = new BlockSizes((block) => this.renderKey(block))`, replaces
`heights` / `heightOf` / `totalHeight` / `offsetOf` / `windowRange` with calls into the
two modules, and keeps `measureMounted` and `updateSpacers` as the two places that
touch the DOM: measure, then write `style.height`. `MIN_SPARE_ELEMENTS` is imported
where the spare cache uses it.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit          # silent
npm run check             # 14/14
```

Freshly started app, the probes that watch the window and the heights:

```bash
npm run probe -- test/probes/scroll-cost.js
npm run probe -- test/probes/block-gaps.js
npm run probe -- test/probes/empty-paragraphs.js
npm run probe -- test/probes/fixture-large-document.js
```

- [ ] **Step 6: Commit** — `refactor(render): give the renderer's arithmetic a home, and a check`

### Task 2: The extension contract, written down

**Files:**
- Modify: `docs/architecture.md` ("Extension points"), `docs/ai-context.md` (the render row)

**Interfaces:**

- Produces: the statement P4 is accepted against — for each extension point, the file
  that owns it, and the recipe that walks a contributor through it.

- [ ] **Step 1: Replace "Extension points" with the contract**

```md
| Extension point | The file that owns it | Adding one |
| --- | --- | --- |
| A markdown construct's rendering | `nodes/<type>.ts`, registered in `create_node.ts` | `docs/adding-a-node.md` |
| Whether a node's markdown can stand in for its rendering | the `showsSource` flag in `registry.ts: registerComponent` | `docs/adding-a-node.md`, step 4 |
| Which source is shown, and where a click enters it | `source_mode.ts`, with `nodes/revealable_node.ts` | `docs/adding-a-node.md`, step 4 |
| A command the author can ask for | the id in `commands/registry.ts`, the work registered in `markdown_editor.ts: registerCommandEvents`, the trigger | `docs/adding-a-command.md` |
| How the document splits into blocks | `blocks.ts` | a task in the block model, plus `test/checks/check-blocks.mjs` |
| A pure rule about markdown | the matching `syntax/*.ts`, named in the one-fact-one-home table above | `docs/testing.md` — rule-shaped means `test/checks/` |
| What a block is worth in pixels | `block_sizes.ts` | a case in `test/checks/check-block-sizes.mjs` |
| Which blocks are mounted | `viewport_window.ts` | the same |
```

Keep the note that the registry is the single place that says which node types exist,
so an extension point is never "the renderer" and always a named file.

- [ ] **Step 2: Point the maps at the two new modules**

The render layer row in both `docs/architecture.md` and `docs/ai-context.md` gains
`block_sizes.ts` and `viewport_window.ts`.

- [ ] **Step 3: Verify**

```bash
rg -n "Extension point" docs/architecture.md   # the table is there
npm run check                                   # 14/14
```

- [ ] **Step 4: Commit** — `docs: name the file that owns each extension point`

### Task 3: The header check, landed red

**Files:**
- Create: `test/checks/headers.mjs`
- Modify: `test/README.md` (the check index)

**Interfaces:**

- Produces: the rule Tasks 4–7 satisfy — every `.ts` under `src/ui/markdown` opens with
  a `/** … */` header whose first line is a sentence and which says `May import:` and
  `Upholds:`.

- [ ] **Step 1: Write the check**

```js
// readFileSync, readdirSync, statSync from 'node:fs'; join from 'node:path'.
const root = 'src/ui/markdown';
const files = [];
(function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.ts')) files.push(path);
  }
})(root);
files.sort();

const failures = [];
for (const file of files) {
  const header = /^\s*\/\*\*([\s\S]*?)\*\//.exec(readFileSync(file, 'utf8'));
  if (!header) {
    failures.push(`${file}: opens with no header comment`);
    continue;
  }
  const text = header[1];
  const opening =
    text.split('\n').map((line) => line.replace(/^\s*\*?\s?/, '')).filter(Boolean)[0] ?? '';
  if (!opening || /^(May import|Upholds):/.test(opening)) {
    failures.push(`${file}: the header opens with a sentence, not with ${JSON.stringify(opening)}`);
  }
  for (const line of ['May import:', 'Upholds:']) {
    if (!text.includes(line)) {
      failures.push(`${file}: the header does not say ${line.slice(0, -1).toLowerCase()}`);
    }
  }
}
```

It covers `.d.ts` too — a declaration file is still a module with a contract — and it
reads only the first header block, so a module may keep its long prose below the three
lines.

- [ ] **Step 2: Run it, and keep the output**

```bash
npm run check    # 14 checks, one failing; headers.mjs names 82 modules
```

That list is the work. `npm run check` is expected to fail for the rest of the phase:
each sweep commit shrinks the list, and the last one takes it to zero.

- [ ] **Step 3: Commit** — `test: say what a module header must say, and watch 82 disagree`

### Tasks 4–7: The sweep

One task and one commit per area, each shrinking the check's list. The rule for every
header is the same three parts:

1. **The sentence** — the module's job in one line. Most modules already have one as
   the first line of their prose header: keep it, and keep the prose below it.
2. **`May import:`** — read the file's own imports and name the *layers*, not the
   files. The layer table in `docs/architecture.md` is the authority: `syntax/` may
   import itself and the parser; `blocks.ts` (document) may import `syntax/`; the
   render layer (`create_block.ts`, `registry.ts`, `create_node.ts`, `nodes/*`,
   `source_mode.ts`, `format*.ts`, `lazy.ts`, the renderer, the new size modules) may
   import the document and the syntax layers; `caret/` may import the render layer;
   `editing/`, `commands/`, `click_routing.ts` and `markdown_editor.ts` may import
   everything above them.
3. **`Upholds:`** — the invariant from `docs/architecture.md` the module is part of. A
   node component upholds "a block's rendering is a pure function of its own source";
   an editing rule upholds "the document text is the only source of truth"; a caret
   module upholds "the offset is the truth and the rendered position is derived"; a
   syntax module names the markdown fact it owns.

- [ ] **Task 4: the node components** — `src/ui/markdown/nodes/*.ts` (26 files)
  - [ ] Give all 26 the three lines, keeping each file's existing prose.
  - [ ] `npx tsc --noEmit`; `npm run check` (the list shrinks by 26); probes
        `npm run probe -- test/probes/revealable-flows.js` and
        `npm run probe -- test/probes/table-style.js`.
  - [ ] Commit — `docs(nodes): give every node component its header`
- [ ] **Task 5: the commands and the editing rules** — `editing/*.ts` (15) and
      `commands/*.ts` (3)
  - [ ] Give all 18 the three lines.
  - [ ] `npx tsc --noEmit`; `npm run check`; probes `npm run probe -- test/probes/enter.js`,
        `npm run probe -- test/probes/list-buttons.js`, `npm run probe -- test/probes/insert-rule.js`.
  - [ ] Commit — `docs(editing): give the commands and the rules their headers`
- [ ] **Task 6: the pure layers** — `syntax/*.ts` (12), `caret/*.ts` (3 left),
      `plugins/**` (9)
  - [ ] Give all 24 the three lines. The syntax modules say which fact they own, so
        their headers and the one-fact-one-home table agree.
  - [ ] `npx tsc --noEmit`; `npm run check`; `test/checks/layering.mjs` still passes.
  - [ ] Commit — `docs(syntax): give the pure modules their headers`
- [ ] **Task 7: the rest of the tree** — the 13 remaining top-level modules and
      `mdast.d.ts`
  - [ ] Give all 14 the three lines; `mdast.d.ts` is included because a declaration
        file is a module with a contract too.
  - [ ] `npx tsc --noEmit`; `npm run check` → **14/14, headers.mjs green**.
  - [ ] Commit — `docs: finish the module headers, and make the check green`

### Task 8: The phase's acceptance run

- [ ] **Step 1: Everything, from a freshly started app**

```bash
npx tsc --noEmit
npm run check
npm run tauri dev                 # terminal 1
npm run probe:all                 # terminal 2 — 59/59 (6 skipped)
```

- [ ] **Step 2: Write the handoff**

Record what the phase changed, what the check now enforces, and what a later
contributor has to do when they add a module. Say which probes were run by name, and
write down anything the sweep found — a header that could not be written honestly is a
finding about the module, not about the header.

## Notes for the implementer

- Do not rewrite what you move. Task 1 is a move: the numbers, the comments and the
  fallbacks are the code that was tuned; a "cleaner" estimate is a behaviour change.
- The sweep is prose, but it is not busywork: writing the sentence is how you find a
  module that does two jobs, and writing `May import:` is how you find an import that
  reaches across a layer. If a header cannot be written without an "and", say so in
  the commit message rather than hiding it.
- `npm run check` failing between Task 3 and Task 7 is the plan, not a mistake. Keep
  each commit's list shorter than the last.
- Probes are the safety net for the renderer: a wrong window size still compiles.
  Restart `npm run tauri dev` before the acceptance run.

---

## Handoff (2026-09-22, P4 complete — the spec's phases are done)

**Where the branch is.** `codex/editor-render-contract`. P4's three deliverables
landed: the renderer's arithmetic is `block_sizes.ts` and `viewport_window.ts` with
`test/checks/check-block-sizes.mjs` asserting it in Node; `docs/architecture.md`'s
extension points are a table naming the file that owns each one; and
`test/checks/headers.mjs` is green on all 88 modules under `src/ui/markdown`.

`npx tsc --noEmit` is clean, `npm run check` is 15/15, and `npm run probe:all` is
59/59 (6 skipped) from a freshly started app. Run by name as well: `scroll-cost.js`
and `fixture-large-document.js` (each with the 323 KB note), `code-tab.js`,
`inline-math-source.js`, `math-source-caret.js`, `block-gaps.js`,
`empty-paragraphs.js`, `revealable-flows.js`, `table-style.js`, `enter.js`,
`list-buttons.js`, `insert-rule.js`.

**What the tree now enforces.** A new module under `src/ui/markdown` must open with
the three-line header or `npm run check` fails: that is the one rule a contributor
cannot forget, because the first thing they do — create a file — is checked. The
one-fact-one-home rule, the layering rule and the command rule were already
checked; the header rule was the last one living only in prose.

**What the sweep found.**

- **Three probes had never run**, all for the same class of reason: `footnote-button.js`
  crashed on `querySelectorAll(...).pop()` (fixed in P2), and `table-menu.js` and
  `scroll-cost.js` had `@needs-*` markers *outside* their header comments, so both
  files were syntax errors — invisible because `probe:all` skips a probe on that
  very string. `scroll-cost.js` also declared its `nextFrames` helper after the
  probe's expression, which the bridge can never see. The runner now parses every
  probe before running any, skipped or not.
- **Seven modules kept their prose below their imports** (`code_edits.ts`,
  `lines.ts`, `parser.ts`, `trailing_spaces.ts`, `blocks.ts`,
  `virtual_block_renderer.ts`, `markdown_editor.ts`), and `syntax/trailing_spaces.ts`
  had no header at all before the sweep — it is one of the seven. The prose was
  there; the shape was not, which is exactly what a reader skimming headers was
  missing.
- **Two headers say something narrower on purpose**, and the sweep kept them
  honest rather than smoothing them over: `editing/line_removal.ts` imports nothing
  at all, and `editing/find_bar.ts` knows nothing about the document — that is what
  keeps the search testable without a window.

**Left for a later phase, none of it in P0–P4.**

- Section 5's directory layout (`document/`, `render/`, `commands/` as
  subdirectories) was never named in any phase's acceptance, so the files still sit
  flat in `src/ui/markdown/`. Moving them is mechanical now that the headers and the
  checks agree, and it would touch every import in the tree — worth its own phase.
- P3's handoff list stands: a thematic break shows remark's canonical `***` as its
  source view rather than the `---` written; `blockPadding` adds two blank lines at
  offset 0 where `paragraphStart` already knows nothing above needs no separator;
  `list:outdent` is registered with no trigger naming it.
- The command registrations still live in `markdown_editor.ts: registerCommandEvents`.
  They could follow `click_routing.ts` into their own module when that file earns
  one; P2 chose the wiring, P3 and P4 left it.
