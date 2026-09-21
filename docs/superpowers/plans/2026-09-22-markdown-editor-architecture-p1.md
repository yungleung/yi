# Markdown editor clean-up, P1 (the syntax core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every markdown-syntax fact one home. Today the same rules — what opens a fence, what a `$$` line is, what a list marker is, what starts a block, how a table is laid out — are restated across five modules, which is how `check-enter.mjs` came to rot. After P1 they live in `src/ui/markdown/syntax/`, a module there may import only other syntax modules, and a check enforces it.

**Architecture:** A pure, DOM-free `syntax/` layer that everything else imports downwards from. Modules move; function names stay; callers are updated mechanically. Nothing about behaviour changes.

**Tech Stack:** TypeScript (bundler resolution), rolldown (the checks bundle modules with it), Node 20+.

**Spec:** `docs/superpowers/specs/2026-09-21-markdown-editor-architecture-design.md` (sections 5, 8 P1)

## Global Constraints

- Behaviour is preserved: this is a move and a dedupe, not a redesign.
- Function names do not change; only their module does. `git mv` for the moves, so history follows.
- A syntax module may import only other syntax modules and type-only imports from `mdast`/`./ast`. No DOM, no `state`, no `position`, no `caret`.
- `npx tsc --noEmit` and `npm run check` stay green; the probes for blocks, code, lists, tables and math source stay green.
- Commit style: `refactor(editor): …`, `test: …`, `docs: …`.

## The inventory (one fact, one home)

| Fact | Lives today in | Moves to |
| --- | --- | --- |
| Fence markers ```` ``` ````/`~~~`, the closing fence rule | `blocks.ts` (`openingFence`, `closingFence`) | `syntax/markers.ts` |
| Frontmatter delimiters `---`/`+++` | `blocks.ts` (`frontmatterDelimiter`) | `syntax/markers.ts` |
| HTML block terminators | `blocks.ts` (`htmlBlockTerminator`) | `syntax/markers.ts` |
| List markers (`-`, `*`, `+`, `1.`), and blank-item lines | `blocks.ts` (`listMarker`), `list_lines.ts` (`LIST_ITEM_MARKER`, `isBlankItemLine`) | `syntax/markers.ts` (the regexes) + `syntax/list_lines.ts` (the line rules) |
| What starts a block (so a trailing space cannot continue the line above) | `trailing_spaces.ts` (`BLOCK_START`) | `syntax/markers.ts`, one regex built from the others |
| A line that delimits a code block or a display formula | `code_edits.ts` (`isDelimiter`, private) | `syntax/markers.ts` (`isDelimiterLine`), imported by `code_edits.ts` |
| Line spans, touched lines, item subtrees | `list_lines.ts` | `syntax/lines.ts` |
| Empty-paragraph lines | `blank_lines.ts` | `syntax/blank_lines.ts` |
| Trailing-space rewriting | `trailing_spaces.ts` (`withVisibleTrailingSpaces`) | `syntax/trailing_spaces.ts` |
| Table source reading/writing | `table_source.ts` | `syntax/table_source.ts` |
| Table row/column edits | `table_edits.ts` | `syntax/table_edits.ts` |
| Code indent edit, list edits, `TextEdit`/`shiftOffset` | `code_edits.ts`, `list_edits.ts`, `edit_range.ts` | `syntax/code_edits.ts`, `syntax/list_edits.ts`, `syntax/edit_range.ts` |
| Empty list items the parser swallowed, footnote labels | `empty_items.ts`, `footnotes.ts` | `syntax/empty_items.ts`, `syntax/footnotes.ts` |
| The remark pipeline | `parser.ts` | `syntax/parser.ts` |

`blockParseInput(block)` stays in the document layer: it needs a block, so it is not syntax. It imports `withVisibleTrailingSpaces` and `isRawRendered`.

## File structure after P1

```
src/ui/markdown/syntax/
  markers.ts        fences, frontmatter, list markers, html terminators, delimiter lines
  lines.ts          line spans, touched lines, item subtrees
  blank_lines.ts    empty-paragraph lines
  trailing_spaces.ts
  table_source.ts table_edits.ts list_edits.ts code_edits.ts edit_range.ts
  empty_items.ts footnotes.ts parser.ts
```

everything else under `src/ui/markdown/` imports from `./syntax/…`.

---

### Task 1: The check that says where each fact belongs

**Files:** Create `test/checks/syntax-home.mjs`

- [ ] **Step 1: Write the check**

It bundles nothing; it reads the sources and asserts:

1. `src/ui/markdown/syntax/markers.ts` exists and exports `openingFence`, `closingFence`, `frontmatterDelimiter`, `htmlBlockTerminator`, `listMarker`, `isDelimiterLine`, `startsBlock`.
2. None of those names is *defined* anywhere else under `src/ui/markdown` (`export function name`, `function name`, `const name =`).
3. `blocks.ts` and `code_edits.ts` contain no fence/delimiter/list-marker regex of their own: they must not match `/^\s*```/`, `/\$\$/` or `/^( {0,3})([-*+]|\d+[.)])(?:\s+|$)/`.

```js
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = 'src/ui/markdown';
const files = [];
(function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.ts')) files.push(path);
  }
})(root);

const sources = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]));
const failures = [];
const check = (name, condition) => {
  if (!condition) failures.push(name);
};

const markers = 'src/ui/markdown/syntax/markers.ts';
const markerText = sources.get(markers) ?? '';
for (const symbol of [
  'openingFence', 'closingFence', 'frontmatterDelimiter', 'htmlBlockTerminator',
  'listMarker', 'isDelimiterLine', 'startsBlock'
]) {
  check(`${markers} exports ${symbol}`, new RegExp(`export function ${symbol}\\b`).test(markerText));
  for (const [file, text] of sources) {
    if (file === markers) continue;
    check(`${symbol} is defined only in syntax/markers.ts (found in ${file})`,
      !new RegExp(`(?:export )?function ${symbol}\\b`).test(text));
  }
}

// The regexes themselves must not be restated.
const banned = [
  ['a fence pattern', /\/\^\(\?: \{0,3\}\)\(\?:`\{3,\}\|~\{3,\}\)/],
  ['a display-math delimiter', /\\\$\\\$\s\*\$\//],
  ['a list marker', /\^\( \{0,3\}\)\(\?:\[-\*\+\]\|\\d\+\[\.\)\]\)/]
];
for (const file of ['src/ui/markdown/blocks.ts', 'src/ui/markdown/syntax/code_edits.ts']) {
  const text = sources.get(file) ?? '';
  for (const [what, pattern] of banned) {
    check(`${file} does not restate ${what}`, !pattern.test(text));
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('syntax homes: all checks passed');
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node test/checks/syntax-home.mjs
```

Expected: `syntax/markers.ts exports openingFence` and friends, plus the restated-regex failures.

- [ ] **Step 3: Commit**

```bash
git add test/checks/syntax-home.mjs
git commit -m "test: say where each markdown-syntax fact belongs, and watch it fail"
```

---

### Task 2: Move the syntax modules and extract `markers.ts`

**Files:** create `src/ui/markdown/syntax/**`; modify every importer

- [ ] **Step 1: Find the importers**

```bash
rg -n "from '\./(blocks|list_lines|blank_lines|trailing_spaces|table_source|table_edits|list_edits|code_edits|edit_range|empty_items|footnotes|parser)'" src/ui/markdown
rg -n "from '\.\./(blocks|list_lines|blank_lines|trailing_spaces|table_source|table_edits|list_edits|code_edits|edit_range|empty_items|footnotes|parser)'" src/ui/markdown
```

- [ ] **Step 2: Move the modules with `git mv`**

`list_lines.ts` → `syntax/lines.ts`; `blank_lines.ts`, `trailing_spaces.ts`, `table_source.ts`, `table_edits.ts`, `list_edits.ts`, `code_edits.ts`, `edit_range.ts`, `empty_items.ts`, `footnotes.ts`, `parser.ts` → `syntax/`.

- [ ] **Step 3: Extract `syntax/markers.ts`**

Move `openingFence`, `closingFence`, `frontmatterDelimiter`, `htmlBlockTerminator`, `listMarker` out of `blocks.ts`; `LIST_ITEM_MARKER` out of `syntax/lines.ts`; `isDelimiter` out of `syntax/code_edits.ts` (exported as `isDelimiterLine`); the `BLOCK_START` regex out of `syntax/trailing_spaces.ts`; and build `startsBlock(line)` from them. `blocks.ts`, `syntax/code_edits.ts` and `syntax/trailing_spaces.ts` import what they use.

- [ ] **Step 4: Update the importers** — mechanical, one line each; keep names.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit
npm run check
```

Expected: tsc silent; `10/10 checks passed` (the new check now passes).

- [ ] **Step 6: Commit**

```bash
git add -A src test
git commit -m "refactor(editor): give markdown syntax one home"
```

---

### Task 3: Enforce the boundary

**Files:** create `test/checks/layering.mjs`; modify `docs/architecture.md`, `docs/ai-context.md`, `test/README.md`

- [ ] **Step 1: Write the layering check** — for every file under `src/ui/markdown/syntax/`, every `from '…'` import must start with `./` (another syntax module) or be type-only from `mdast`/`./ast`; anything else fails with the file and the specifier. Add it to the same file as Task 1's check if that reads better.
- [ ] **Step 2: Fix what it finds** — a syntax module that imports the DOM names the fact it needs moved instead.
- [ ] **Step 3: Update the docs** — `docs/architecture.md`: the layer table's syntax row lists `syntax/…`, and the one-fact-one-home section becomes the table from this plan. `docs/ai-context.md`: the map row and any path that moved. `test/README.md`: the check index gains the new rows.
- [ ] **Step 4: Verify** — `npm run check` green (`11/11`), and every command in the edited docs still runs as written.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "refactor(editor): keep the syntax layer DOM-free, and check it"`.

---

### Task 4: Prove the editor is unchanged

**Files:** none; this is the phase's acceptance run.

- [ ] **Step 1: Start the app fresh** — `npm run tauri dev` (a long-running app degrades and every probe then times out).
- [ ] **Step 2: Run the probes that touch syntax** — `block-gaps`, `spacing`, `code-tab`, `code-shift-tab`, `list-tab-indent`, `list-tab-outdent`, `table-keys`, `table-insert`, `math-source-tab`, `display-math-source`.
- [ ] **Step 3: Run the whole suite** — `npm run probe:all` → `58/58 passed, 5 skipped` (the counts from P0).
- [ ] **Step 4: Report** — if any probe fails, the move changed behaviour: fix it before going on. No commit unless something changed.

---

## Notes for the implementer

- Do not rename functions. `itemSubtreeEnd`, `lineSpanAt`, `codeIndentEdit`, `readTableSource` and friends keep their names; only their paths change.
- `blockParseInput` (the one that rewrites a block's parse input) stays outside `syntax/`, because it takes a block. It imports the syntax helpers it needs.
- After Task 2 every `rg "from './blocks'"` under `src/ui/markdown/syntax` is a bug — that is what Task 3's check is for.
