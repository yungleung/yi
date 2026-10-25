# Table Cross-References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add captioned table targets, automatic references, editable captions, and consistent export behavior without changing table-cell editing or owning margin-table layout.

**Architecture:** A pure caption parser recognizes the table's optional separation line and caption source. Parser repair attaches that caption to the table node; the shared reference index numbers every captioned table and gives an ID-bearing caption its target. The editor renders the caption as a revealable sibling inside the table block, while export adapters rewrite captions, targets, and LaTeX references for each writer.

**Tech Stack:** TypeScript, unified/remark/mdast, Tauri, Pandoc, XeLaTeX, Node checks, Tauri MCP probes.

**Spec:** `docs/superpowers/specs/2026-10-25-table-cross-references-design.md`

## Global Constraints

- The raw Markdown text is the only source of truth; every edit is a raw-text range replacement.
- A syntax module never imports the DOM.
- A block's rendering is derived from its source plus the shared reference index; it never stores a second copy of the document.
- Every captioned table consumes one number in document order; only an ID-bearing table is a reference target.
- Margin tables share the ordinary table sequence. Yi ships no margin-table filter.
- The optional separator and caption are independently addressable editor lines.
- Table-cell offsets stop at the table's last row; following lines never map to the nearest cell.
- Template Lua filters that rewrite tables must preserve `\caption{…}` and `\label{…}`.
- LaTeX/PDF automatic table references resolve through `\yiTableRef{id}` and `\ref`, not a precomputed number.
- Do not merge this branch into `main` unless explicitly requested.

---

### Task 1: Bound the Table Cell Mapper

**Files:**
- Modify: `src/ui/markdown/syntax/table_source.ts`
- Modify: `test/checks/check-table-source.mjs`
- Create: `test/probes/table-blank-line-typing.js`
- Modify: `test/README.md`

**Interfaces:**
- Consumes: `readTableSource(text: string, at?: number): TableSource | null`
- Produces: `TableSource.from: number`, `TableSource.to: number`, and `locateCell(source, offset): TableCellSpan | null` returning null outside `[from, to]`.

- [ ] **Step 1: Write the failing pure test**

Add to `test/checks/check-table-source.mjs`:

```js
const bounded = readTableSource('| a |\n| --- |\n| 1 |');
check(
  'an offset after the table has no cell',
  locateCell(bounded, bounded.to + 1),
  null
);
check(
  'the last row end still belongs to its cell',
  locateCell(bounded, bounded.to)?.row,
  1
);
```

- [ ] **Step 2: Run the pure test and verify RED**

Run: `node test/checks/check-table-source.mjs`

Expected: FAIL because `bounded.to` and the outside-offset rule do not exist.

- [ ] **Step 3: Add the bounded source range**

In `src/ui/markdown/syntax/table_source.ts`, extend `TableSource`:

```ts
export interface TableSource {
  from: number;
  to: number;
  rows: TableRow[];
  delimiter: { start: number; end: number };
  columns: number;
  align: ColumnAlign[];
}
```

Build `rows` first, then return:

```ts
const from = rows[0].start;
const to = rows[rows.length - 1].end;
return { from, to, rows, delimiter: ..., columns: ..., align };
```

At the start of `locateCell`:

```ts
if (offset < source.from || offset > source.to) {
  return null;
}
```

- [ ] **Step 4: Run the pure test and verify GREEN**

Run: `node test/checks/check-table-source.mjs`

Expected: `table source: all checks passed`.

- [ ] **Step 5: Write the failing app probe**

Create `test/probes/table-blank-line-typing.js`:

```js
/**
 * A blank line after a table keeps its own caret and source.
 *
 * @covers src/ui/markdown/syntax/table_source.ts,
 *   src/ui/markdown/caret/dom_position.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });

  await t.load('| A | B |\n| --- | --- |\n| 1 | 2 |\n\n\nAfter\n');
  const blocks = t.blocks();
  const blank = blocks.find((block) => block.dataset.lineStart === '4');
  await t.click(blank, 0.5);
  t.key('x');
  await t.sleep(250);
  const raw = await t.raw();
  const caret = t.caretRect();
  const line = t.blocks().find((block) => block.textContent.includes('x'));

  check('the character lands on the blank line', raw, '| A | B |\n| --- | --- |\n| 1 | 2 |\n\nx\n\nAfter\n');
  check('the table cells do not change', t.prose().querySelector('[data-table-cell="1:1"]')?.textContent ?? null, '2');
  check('the caret stays in the new line', line !== undefined && caret !== null && caret.y >= line.getBoundingClientRect().top, true);
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
```

- [ ] **Step 6: Run the probe and verify RED**

Run: `npm run probe -- test/probes/table-blank-line-typing.js`

Expected: the character is written into the final table cell instead of line 4.

- [ ] **Step 7: Run the probe and focused regression set after the fix**

Run:

```bash
npm run probe -- test/probes/table-blank-line-typing.js
npm run probe -- test/probes/table-cell-typing.js
npm run probe -- test/probes/table-enter-exit-caret.js
```

Expected: all three probes pass.

- [ ] **Step 8: Update the probe index and commit**

Add `table-blank-line-typing` under the table probes in `test/README.md`.

```bash
git add src/ui/markdown/syntax/table_source.ts test/checks/check-table-source.mjs test/probes/table-blank-line-typing.js test/README.md
git commit -m "fix(editor): keep caret after a table"
```

---

### Task 2: Parse Table Caption Lines

**Files:**
- Create: `src/ui/markdown/syntax/table_captions.ts`
- Create: `test/checks/check-table-captions.mjs`
- Modify: `test/run-checks.mjs`

**Interfaces:**
- Consumes: `attributeBlockAtEnd(source: string, end: number, requireSpace: boolean)`
- Produces:

```ts
export interface TableCaptionData {
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  caption: string;
  attribute: PandocAttributeBlock | null;
  captionFrom: number;
  captionTo: number;
  textFrom: number;
  textTo: number;
}

export function tableCaptionLine(line: string, from: number): TableCaptionData | null;
export function isTableCaptionLine(line: string): boolean;
```

- [ ] **Step 1: Write the failing caption-parser check**

Create `test/checks/check-table-captions.mjs` using the same Rolldown harness as `check-table-source.mjs`. Include:

```js
const caption = tableCaptionLine(
  ': Results {#tbl:results .margin data-owner=demo}', 100
);
check('caption identity', [caption.id, caption.classes, caption.attributes], [
  'tbl:results', ['margin'], { 'data-owner': 'demo' }
]);
check('caption text range', caption.caption, 'Results');
check('absolute caption range', [caption.captionFrom, caption.captionTo], [100, 148]);
check('ID-only caption', tableCaptionLine(': {#tbl:id}', 0)?.id, 'tbl:id');
check('empty caption without ID is not a caption', tableCaptionLine(': ', 0), null);
check('a plain paragraph is not a caption', tableCaptionLine('Caption', 0), null);
check(
  'malformed attributes remain caption text',
  tableCaptionLine(': Results {#tbl:id bare}', 0)?.id,
  null
);
```

- [ ] **Step 2: Run the check and verify RED**

Run: `node test/checks/check-table-captions.mjs`

Expected: module import fails because `table_captions.ts` does not exist.

- [ ] **Step 3: Implement the pure caption parser**

`table_caption_line` must:

- require `^:\s+`;
- trim only the line terminator for its range;
- find one trailing Pandoc attribute block with `attributeBlockAtEnd`;
- keep the remainder as inline caption source;
- return null when both caption text and ID are empty;
- shift all ranges by the supplied absolute `from`.

- [ ] **Step 4: Run the check and verify GREEN**

Run: `node test/checks/check-table-captions.mjs`

Expected: `table captions: all checks passed`.

- [ ] **Step 5: Register the check and commit**

Add `check-table-captions` to `test/run-checks.mjs`.

```bash
git add src/ui/markdown/syntax/table_captions.ts test/checks/check-table-captions.mjs test/run-checks.mjs
git commit -m "feat(markdown): parse table captions"
```

---

### Task 3: Attach Captions to Tables and Group Their Blocks

**Files:**
- Modify: `src/ui/markdown/syntax/table_captions.ts`
- Modify: `src/ui/markdown/syntax/parser.ts`
- Modify: `src/ui/markdown/syntax/table_source.ts`
- Modify: `src/ui/markdown/ast.ts`
- Modify: `src/ui/markdown/mdast.d.ts`
- Modify: `src/ui/markdown/document/blocks.ts`
- Modify: `test/checks/check-table-captions.mjs`
- Modify: `test/checks/check-blocks.mjs`

**Interfaces:**
- Consumes: `TableCaptionData`, `readTableSource(text)`
- Produces:

```ts
export interface TableCaptionNode {
  type: 'tableCaption';
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  caption: RootContent[];
  source: string;
  captionData: TableCaptionData;
  position: { start: { offset: number }; end: { offset: number } };
}

export function restoreTableCaptions(tree: Root, markdown: string): void;
```

- [ ] **Step 1: Write failing parser checks**

Extend `check-table-captions.mjs` to parse and inspect:

```js
const direct = parseMarkdown(
  '| A |\n| --- |\n| 1 |\n: Results {#tbl:x .margin}\n'
);
check('direct caption is not a table row', direct.children[0].children.length, 2);
check('direct caption follows the table', direct.children.map((n) => n.type), ['table', 'tableCaption']);
check('caption identity survives parsing', direct.children[1].id, 'tbl:x');

const separated = parseMarkdown(
  '| A |\n| --- |\n| 1 |\n\n: Results {#tbl:x}\n'
);
check('one blank separator is accepted', separated.children.map((n) => n.type), ['table', 'tableCaption']);

const distant = parseMarkdown(
  '| A |\n| --- |\n| 1 |\n\n\n: Not this table\n'
);
check('two blank lines do not attach', distant.children.some((n) => n.type === 'tableCaption'), false);
```

Add block checks asserting one paragraph block covers `table\n\n: Caption`.

- [ ] **Step 2: Run checks and verify RED**

Run:

```bash
node test/checks/check-table-captions.mjs
node test/checks/check-blocks.mjs
```

Expected: caption nodes are absent and the separated form is split across blocks.

- [ ] **Step 3: Implement parser repair**

Add `restoreTableCaptions(root, markdown)` after `restoreFigures` in `parseMarkdown`.

The repair must:

- inspect a `table` node followed immediately by either a `tableCaption` candidate or no more than one blank line and a caption line;
- handle remark swallowing a no-blank caption as a final one-cell table row;
- remove that swallowed row;
- remove the paragraph/list nodes created for a separated caption;
- append one `tableCaption` sibling with exact source positions;
- leave the table untouched when the caption is malformed or separated by two blanks.

Add a stringifier handler:

```ts
tableCaption(node: any): string {
  return `${String(node.source ?? '').trimEnd()}\n`;
}
```

- [ ] **Step 4: Group blocks across one separator**

When a paragraph block contains a table and is followed by one blank line and a
valid caption line, consume the blank and caption into the same paragraph block.
Do not group zero or two blank lines:

- zero blank is already in the same non-blank run;
- one blank uses the caption lookahead;
- two blank lines remain separate blocks.

The re-split path must produce the same grouping by using the same helper.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node test/checks/check-table-captions.mjs
node test/checks/check-blocks.mjs
npm run check
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/markdown/syntax/table_captions.ts src/ui/markdown/syntax/parser.ts src/ui/markdown/syntax/table_source.ts src/ui/markdown/ast.ts src/ui/markdown/mdast.d.ts src/ui/markdown/document/blocks.ts test/checks/check-table-captions.mjs test/checks/check-blocks.mjs
git commit -m "feat(markdown): attach captions to tables"
```

---

### Task 4: Add Table Labels, Prefixes, and Reference Indexing

**Files:**
- Create: `src/ui/markdown/syntax/reference_vocabulary.ts`
- Create: `test/checks/check-reference-vocabulary.mjs`
- Modify: `src/ui/markdown/document/reference_index.ts`
- Modify: `src/ui/markdown/document/state.ts`
- Modify: `src/ui/markdown/render_context.ts`
- Modify: `src/ui/markdown/markdown_editor.ts`
- Modify: `src/ui/markdown/editing/references.ts`
- Modify: `src/ui/export/preprocess.ts`
- Modify: `test/checks/check-reference-index.mjs`
- Modify: `test/checks/check-export.mjs`
- Modify: `test/run-checks.mjs`
- Modify: locale JSON files only to remove unused `reference.figure` if no other use remains.

**Interfaces:**
- Consumes: parsed `table` followed by `tableCaption`
- Produces:

```ts
export type NumberedReferenceKind = 'figure' | 'table' | 'equation' | 'list' | 'listing';
export interface ReferenceStyle {
  label: string;
  prefix: string;
}
export function referenceVocabularyFromTree(tree: Root): Record<NumberedReferenceKind, ReferenceStyle>;
export function referenceKindText(kind: NumberedReferenceKind, number: number, style: ReferenceStyle): string;
```

`ReferenceKind` becomes `'heading' | 'figure' | 'table'`.

`ReferenceEntry` adds:

```ts
label: string;
numberPrefix: string;
caretAt: number | null;
```

`RenderContext` adds:

```ts
tableLabelAt(from: number): string | null;
```

- [ ] **Step 1: Write the failing vocabulary check**

Cover:

```js
check('table default label', vocabulary.table, { label: 'Table', prefix: '' });
check(
  'table overrides',
  vocabularyFrom('reference-labels:\n  table: Data table\nreference-number-prefixes:\n  table: "2-"\n').table,
  { label: 'Data table', prefix: '2-' }
);
check('empty labels fall back', ..., { label: 'Table', prefix: '' });
check('the app locale is not read', ...);
```

- [ ] **Step 2: Run and verify RED**

Run: `node test/checks/check-reference-vocabulary.mjs`

Expected: module does not exist.

- [ ] **Step 3: Implement the shared vocabulary**

Use the frontmatter YAML parser, accept scalar label/prefix values, fall back
per key to `Figure`, `Table`, `Equation`, `List`, `Listing` and empty prefixes,
and ignore unknown keys.

- [ ] **Step 4: Write the failing table-index test**

In `check-reference-index.mjs`:

```js
const tableDoc =
  '| A |\n| --- |\n| 1 |\n: First\n\n' +
  '| B |\n| --- |\n| 2 |\n\n: Second {#tbl:second}\n\n' +
  '| C |\n| --- |\n| 3 |\n';
const tableEntries = referenceIndex(tableDoc).filter((entry) => entry.kind === 'table');
check('every captioned table is numbered', tableEntries.map((entry) => [entry.id, entry.number]), [
  [null, 1],
  ['tbl:second', 2]
]);
check(
  'table automatic reference uses the label and prefix',
  referenceLabel(tableEntries[1], referenceVocabularyFromTree(parseMarkdown(tableDoc))),
  'Table 2-2'
);
```

- [ ] **Step 5: Implement indexing**

Walk each sibling list. When a `table` is followed by `tableCaption`:

- increment `tableNumber`;
- create an entry for every caption, ID or not;
- set `from` to the table start and `to` to the caption end;
- set `caretAt` to the first header cell's `contentStart`;
- register the ID in `used` only when non-null;
- use the table label and prefix.

Update the state's reference key so a table-caption block re-renders when
`referencesVersion` changes. Add `tableLabelAt` to the render context and wire
it in `markdown_editor.ts` using the shared index.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
node test/checks/check-reference-vocabulary.mjs
node test/checks/check-reference-index.mjs
node test/checks/check-export.mjs
npm run check
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui/markdown/syntax/reference_vocabulary.ts src/ui/markdown/document/reference_index.ts src/ui/markdown/document/state.ts src/ui/markdown/render_context.ts src/ui/markdown/markdown_editor.ts src/ui/markdown/editing/references.ts src/ui/export/preprocess.ts test/checks/check-reference-vocabulary.mjs test/checks/check-reference-index.mjs test/checks/check-export.mjs test/run-checks.mjs locales
git commit -m "feat(crossrefs): index captioned tables"
```

---

### Task 5: Render and Edit Table Captions

**Files:**
- Create: `src/ui/markdown/nodes/table_caption.ts`
- Modify: `src/ui/markdown/create_node.ts`
- Modify: `src/ui/markdown/registry.ts` only if the shared factory needs the registration
- Modify: `src/ui/markdown/nodes/table.ts`
- Modify: `src/ui/markdown/create_block.ts`
- Modify: `src/styles.css`
- Create: `test/probes/table-caption-editing.js`
- Create: `test/probes/table-caption-crossrefs.js`

**Interfaces:**
- Consumes: `AstTableCaption`, `renderContext().tableLabelAt(from)`
- Produces: `.markdown-table-caption`, `.markdown-table-number`, `.markdown-table-caption-source`, and a table block with the caption ID.

- [ ] **Step 1: Write failing rendering/caret probes**

`table-caption-editing.js` must load:

```md
| A | B |
| --- | --- |
| 1 | 2 |

: Results {#tbl:results .margin owner=demo}
```

Assert:

- table and caption are one `.markdown-block`;
- caption reads `Table 1. Results`;
- the table carries `id="tbl:results"`;
- clicking the caption reveals `: Results {#tbl:results .margin owner=demo}`;
- typing in the revealed caption edits that line;
- leaving restores the rendered caption;
- a direct caption and a one-blank caption both reveal their full line.

`table-caption-crossrefs.js` asserts `[#tbl:results]` renders `Table 1` and
Command-click lands in the first header cell.

- [ ] **Step 2: Run probes and verify RED**

Run:

```bash
npm run probe -- test/probes/table-caption-editing.js
npm run probe -- test/probes/table-caption-crossrefs.js
```

Expected: no caption node or rendering exists.

- [ ] **Step 3: Implement the caption component**

Create a `TableCaption` revealable component over the `tableCaption` node:

- render a `<div class="markdown-table-caption" role="caption">`;
- append a generated `[data-chrome]` label from `tableLabelAt`;
- append rendered caption children;
- click opens the complete source through `enterSourceOf`;
- source range is the whole caption line excluding the newline;
- leaving restores the rendering.

Register it with `registerComponent('tableCaption', ..., true)`.

- [ ] **Step 4: Apply the table target and optional separator**

In `create_block.ts`:

- detect a table/caption pair;
- add `.markdown-table-block` to the block;
- set the block's `id` from the caption ID;
- render a `.markdown-table-blank` placeholder for a one-blank separator;
- render the caption below the table.

In `nodes/table.ts`, retain all existing cell roles and `data-table-cell`
offsets; only skip the swallowed caption row after parser repair.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm run probe -- test/probes/table-caption-editing.js
npm run probe -- test/probes/table-caption-crossrefs.js
npm run probe -- test/probes/table-blank-line-typing.js
npm run probe -- test/probes/table-cell-typing.js
npm run probe -- test/probes/table-enter-exit-caret.js
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/markdown/nodes/table_caption.ts src/ui/markdown/create_node.ts src/ui/markdown/registry.ts src/ui/markdown/nodes/table.ts src/ui/markdown/create_block.ts src/styles.css test/probes/table-caption-editing.js test/probes/table-caption-crossrefs.js
git commit -m "feat(editor): render table captions"
```

---

### Task 6: Export Portable Tables and Processed Markdown

**Files:**
- Modify: `src/ui/export/preprocess.ts`
- Modify: `test/checks/check-export.mjs`
- Modify: `test/probes/export-html.js`
- Modify: `test/probes/export-epub.js`
- Modify: `test/probes/export-docx.js`
- Modify: `test/probes/export-odt.js`
- Modify: `test/probes/export-markdown.js`

**Interfaces:**
- Consumes: table/caption nodes and `referenceIndex`
- Produces: captioned Pandoc source for HTML/EPUB, wrapped targets for DOCX/ODT, and HTML table fallback for processed Markdown.

- [ ] **Step 1: Add failing pure export checks**

Add cases to `check-export.mjs` for:

```md
| A | B |
| --- | --- |
| 1 | 2 |
: Caption only
```

and:

```md
| A | B |
| --- | --- |
| 1 | 2 |

: Results {#tbl:x .margin owner=demo}
```

Expected outputs:

- Markdown: one `<table id="tbl:x" class="margin">` with `<caption>Table 2. Results</caption>` and escaped cell HTML;
- HTML/EPUB: `: Table 2. Results {#tbl:x .margin owner="demo"}`;
- DOCX/ODT: one `::: {#tbl:x .table-target}` wrapper around the captioned table;
- ordinary tables left unchanged.

- [ ] **Step 2: Run and verify RED**

Run: `node test/checks/check-export.mjs`

Expected: table caption cases are absent or unchanged.

- [ ] **Step 3: Implement the non-LaTeX lowering**

Add a `tableRewrites` pass to `exportSource`.

Use one helper that:

- builds the visible caption text from the shared index;
- leaves LaTeX/PDF caption text untouched;
- removes the Yi caption line from the table block;
- embeds it in Pandoc's `: …` caption syntax;
- wraps identified DOCX/ODT tables in a `Div`;
- renders processed Markdown as an HTML table;
- passes `.margin` and other attributes through.

- [ ] **Step 4: Update export probes**

Each export probe must assert:

- the table ID reaches the output anchor;
- every caption carries the visible number except LaTeX/PDF;
- an ID-only table shows its label;
- a caption-only table has no target;
- `.margin` is preserved but not interpreted.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node test/checks/check-export.mjs
npm run probe -- test/probes/export-html.js
npm run probe -- test/probes/export-epub.js
npm run probe -- test/probes/export-docx.js
npm run probe -- test/probes/export-odt.js
npm run probe -- test/probes/export-markdown.js
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/export/preprocess.ts test/checks/check-export.mjs test/probes/export-html.js test/probes/export-epub.js test/probes/export-docx.js test/probes/export-odt.js test/probes/export-markdown.js
git commit -m "feat(export): render table references"
```

---

### Task 7: Add Native LaTeX/PDF Table References

**Files:**
- Create: `src/ui/export/reference_header.ts`
- Create: `src-tauri/src/export/reference_header.rs`
- Modify: `src/ui/export/export_flow.ts`
- Modify: `src-tauri/src/export/mod.rs`
- Modify: `src-tauri/src/export/run/mod.rs`
- Modify: `src-tauri/src/export/run/arguments.rs`
- Modify: `src/api/export.ts`
- Modify: `src-tauri/src/export/tests/run/arguments.rs`
- Create: `test/checks/check-reference-header.mjs`
- Modify: `test/checks/check-export.mjs`
- Modify: `test/probes/export-latex.js`
- Modify: `test/probes/export-pdf.js`

**Interfaces:**
- Consumes: table vocabulary and export kind
- Produces: `referenceHeader(markdown: string): string`, a run-specific `reference-header.tex`, and `\yiTableRef{id}` in LaTeX/PDF export source.

- [ ] **Step 1: Write the failing pure tests**

In `check-reference-header.mjs`, assert:

```latex
\AtBeginDocument{%
  \renewcommand{\tablename}{Data table}%
  \renewcommand{\thetable}{\mbox{2-}\arabic{table}}%
}
```

and:

```latex
\providecommand{\yiTableRef}[1]{%
  \hyperref[#1]{\tablename~\ref*{#1}}%
}
```

In `check-export.mjs`, assert automatic table refs become
`\yiTableRef{tbl:x}` for `latex` and `pdf`, while other kinds get ordinary
`[Table N](#tbl:x)` links.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
node test/checks/check-reference-header.mjs
node test/checks/check-export.mjs
```

Expected: header module does not exist and table refs retain the old link form.

- [ ] **Step 3: Implement the header and request plumbing**

Generate the header in the webview for LaTeX/PDF, pass it through `ExportRequest`,
write it into the run folder, and append it with `--include-in-header`.

The header must:

- override `\tablename`;
- override `\thetable` only for a non-empty literal prefix;
- define `\yiTableRef`;
- leave every other target kind's export behavior unchanged.

- [ ] **Step 4: Implement native table source**

For LaTeX/PDF:

- keep table captions unnumbered in their source text;
- keep table IDs on the native caption;
- let all captioned tables increment the table counter;
- lower automatic table references to `\yiTableRef{id}`.

- [ ] **Step 5: Test a template counter and filter contract**

Use the existing complete LaTeX example package. Add a test filter that rewrites
`Table` to `table*` and preserves:

```lua
if tbl.attr.identifier ~= "" then
  lines[#lines + 1] = "\\label{" .. tbl.attr.identifier .. "}"
end
```

Export a table with an ID and assert both `\caption` and `\label` are present.
Set `\renewcommand{\thetable}{X-\arabic{table}}` in a test template and assert
the compiled PDF reference resolves to `X-1`.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
node test/checks/check-reference-header.mjs
node test/checks/check-export.mjs
npm run probe -- test/probes/export-latex.js
npm run probe -- test/probes/export-pdf.js
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui/export/reference_header.ts src-tauri/src/export/reference_header.rs src/ui/export/export_flow.ts src-tauri/src/export/mod.rs src-tauri/src/export/run/mod.rs src-tauri/src/export/run/arguments.rs src/api/export.ts src-tauri/src/export/tests/run/arguments.rs test/checks/check-reference-header.mjs test/checks/check-export.mjs test/probes/export-latex.js test/probes/export-pdf.js
git commit -m "feat(export): resolve table references in latex"
```

---

### Task 8: Document, Demonstrate, and Prove the Feature End to End

**Files:**
- Modify: `src/ui/documentation/documentation.en.md`
- Modify: `test/fixtures/workspace/default-document.md`
- Create: `test/probes/table-crossrefs-default-document.js`
- Modify: `test/probes/table-caption-editing.js`
- Modify: `test/README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/ai-context.md`

**Interfaces:**
- Consumes: all earlier tasks
- Produces: user-facing documentation, fixture examples, and a default-document probe.

- [ ] **Step 1: Expand the fixture**

Add to `default-document.md`:

```md
reference-labels:
  table: Data table
reference-number-prefixes:
  table: "2-"
```

and:

```md
## Tables

See [#tbl:results] or [the results table](#tbl:results).

A table without an ID is still numbered:

| Step | Result |
| --- | --- |

: A caption-only table

A target can stand alone:

| A | B |
| --- | --- |

: {#tbl:target}

Attributes and margin placement belong to the source and template:

| Name | Value |
| --- | --- |

: Results {#tbl:results .margin data-owner=demo}
```

- [ ] **Step 2: Write the failing default-document probe**

Assert:

- two captioned tables show `Data table 2-1.` and `Data table 2-2.`;
- the ID-only table shows its label;
- the automatic reference reads `Data table 2-2`;
- the `.margin` class is not applied in the editor;
- Command-click reaches the first header cell.

- [ ] **Step 3: Run the probe and verify RED**

Run:

```bash
npm run probe -- --fixture default-document.md test/probes/table-crossrefs-default-document.js
```

Expected: failure until the fixture and implementation are complete.

- [ ] **Step 4: Document every user-visible case**

Document:

- caption syntax and the optional blank separator;
- caption-only, ID-only, and captioned tables;
- automatic and manual references;
- table labels and literal prefixes;
- source editing and caret behavior;
- every export kind;
- `.margin` delegation to templates;
- the Lua-filter caption/label contract.

- [ ] **Step 5: Update architecture and test indexes**

Record:

- `syntax/table_captions.ts` as the caption syntax home;
- the table entry in `document/reference_index.ts`;
- `yiTableRef` in the generated LaTeX header;
- the new checks and probes in `test/README.md`.

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
npx tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml
npm run check
npm run probe -- --fixture default-document.md test/probes/table-crossrefs-default-document.js
npm run probe -- test/probes/table-caption-editing.js
npm run probe -- test/probes/table-caption-crossrefs.js
npm run probe -- test/probes/table-blank-line-typing.js
npm run probe -- test/probes/table-cell-typing.js
npm run probe -- test/probes/table-enter-exit-caret.js
npm run probe:all
```

Expected: compiler, Rust, checks, and all runnable probes pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui/documentation/documentation.en.md test/fixtures/workspace/default-document.md test/probes/table-crossrefs-default-document.js test/probes/table-caption-editing.js test/README.md docs/architecture.md docs/ai-context.md
git commit -m "docs(tables): document table cross-references"
```

---

## Final Review Checklist

- [ ] Every captioned table consumes one number; only ID-bearing tables are targets.
- [ ] Caption-only, ID-only, and captioned tables render and export correctly.
- [ ] Direct and one-blank caption forms are editable as separate lines.
- [ ] A blank line after a table never maps to the nearest cell.
- [ ] Table numbering and every automatic reference update after an earlier insertion.
- [ ] Command-click reaches the first header cell across virtualization.
- [ ] `.margin` is preserved but never interpreted by Yi.
- [ ] No Lua filter is shipped for margin placement.
- [ ] Template-rewritten tables keep caption and label.
- [ ] LaTeX/PDF references follow the package's `\thetable`.
- [ ] Processed Markdown displays an HTML table with caption and target.
- [ ] Documentation, fixture, checks, probes, and indexes cover every case.
