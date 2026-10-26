# List Cross-References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add captioned bullet, ordered, and task lists with stable targets, numbering, automatic references, source editing, and consistent exports.

**Architecture:** A caption line after a list is parsed by the same colon grammar as a table caption, attached to the list's mdast node, indexed as a `list` reference target, rendered as revealable caption chrome, and lowered by one export module. Non-LaTeX writers share one wrapper/caption representation; LaTeX/PDF use a namespaced `yilist` object counter through native `\label`, `\ref`, and `hyperref`.

**Tech Stack:** TypeScript, unified/remark/mdast, Vitest-style Node checks, Pandoc, Tauri MCP probes, LaTeX.

**Spec:** `docs/superpowers/specs/2026-10-26-list-cross-references-design.md`

## Global Constraints

- Never commit to `main`; work on `codex/equation-cross-references` until the maintainer asks to merge.
- A captioned list uses `: Caption {#list:id .class key=value}` after the complete list, directly or after one blank line.
- A colon after a paragraph remains Pandoc definition-list syntax; an indented colon inside an item remains item content.
- Every captioned list consumes one document-global list-object number, even without an ID.
- HTML, EPUB, DOCX, and ODT receive the same normalized wrapper, caption, label, prefix, and sequence.
- LaTeX/PDF use `yilist` through native LaTeX references and never reuse `enumi`, `enumii`, or `table`.
- `\yiListCounterSetup` runs at `\begin{document}` before the document label and prefix are applied.
- Test behavior through the Tauri MCP bridge; `npm run check` alone is insufficient.

---

### Task 1: Shared Caption Grammar and List Caption Syntax

**Files:**
- Create: `src/ui/markdown/syntax/caption_lines.ts`
- Create: `src/ui/markdown/syntax/list_captions.ts`
- Modify: `src/ui/markdown/syntax/table_captions.ts`
- Create: `test/checks/check-list-captions.mjs`
- Modify: `test/checks/check-table-captions.mjs`

**Interfaces:**
- Produces: `CaptionLineData`, `captionLine(line, from): CaptionLineData | null`
- Produces: `ListCaptionAttachment`, `listCaptionAfterList(markdown, listFrom, listEnd): ListCaptionAttachment | null`
- Produces: `listCaptionLine(line, from): ListCaptionData | null`
- Table captions delegate to `captionLine`; their public result remains unchanged.

- [ ] **Step 1: Write the failing caption grammar tests**

Add checks for:

```js
const direct = listCaptionAfterList(
  '- first\n- second\n: Steps {#list:steps .wide owner=demo}\n',
  0,
  '- first\n- second'.length
);
check('direct caption attaches', direct?.caption.id, 'list:steps');
check('caption keeps inline Markdown', direct?.caption.caption, '**Steps**');
check('classes and attributes survive', direct?.caption.classes, ['wide']);

check(
  'one blank line attaches',
  listCaptionAfterList('- item\n\n: Caption\n', 0, '- item'.length)?.caption.caption,
  'Caption'
);
check(
  'two blank lines do not attach',
  listCaptionAfterList('- item\n\n\n: Caption\n', 0, '- item'.length),
  null
);
check('empty colon is ordinary source', listCaptionLine(': ', 0), null);
```

- [ ] **Step 2: Run the check to verify it fails**

Run: `node test/checks/check-list-captions.mjs`

Expected: module-not-found failure for `list_captions.ts`.

- [ ] **Step 3: Extract the shared colon grammar**

Move the body of `tableCaptionLine` into `caption_lines.ts`:

```ts
export interface CaptionLineData {
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  caption: string;
  source: string;
  attribute: PandocAttributeBlock | null;
  captionFrom: number;
  captionTo: number;
  textFrom: number;
  textTo: number;
}

export function captionLine(line: string, from: number): CaptionLineData | null {
  const opening = /^:(\s+)/.exec(line);
  if (opening === null) return null;
  const contentFrom = opening[0].length;
  const relative = attributeBlockAtEnd(line, line.length, true);
  const attribute = relative === null
    ? null
    : {
        ...relative,
        from: from + relative.from,
        to: from + relative.to,
        separatorFrom: from + relative.separatorFrom
      };
  const textEnd = trimSpacesBack(line, relative?.separatorFrom ?? line.length);
  const caption = line.slice(contentFrom, textEnd);
  if (caption === '' && attribute?.id == null) return null;
  return {
    id: attribute?.id ?? null,
    classes: attribute?.classes ?? [],
    attributes: attribute?.attributes ?? {},
    caption,
    source: line,
    attribute,
    captionFrom: from,
    captionTo: from + line.length,
    textFrom: from + contentFrom,
    textTo: from + textEnd
  };
}
```

Keep `TableCaptionData extends CaptionLineData` and make `tableCaptionLine` return it.

- [ ] **Step 4: Implement list-caption attachment**

`listCaptionAfterList` must:

```ts
if (markdown.slice(listFrom, listEnd).trim() === '') return null;
const direct = lineAfter(markdown, listEnd);
const directCaption = captionOnLine(direct, markdown, listFrom);
if (directCaption !== null) return attachment(directCaption, null);
const separated = oneBlankThen(markdown, listEnd);
const separatedCaption = separated === null ? null : captionOnLine(separated, markdown, listFrom);
return separatedCaption === null ? null : attachment(separatedCaption, separated);
```

`captionOnLine` computes the list's leading indentation from the first list line
and accepts only a caption with the same indentation. The attachment exposes
the absolute caption range and optional separator range.

- [ ] **Step 5: Run syntax checks**

Run:

```sh
node test/checks/check-list-captions.mjs
node test/checks/check-table-captions.mjs
```

Expected: both pass.

- [ ] **Step 6: Commit**

```sh
git add src/ui/markdown/syntax/caption_lines.ts src/ui/markdown/syntax/list_captions.ts \
  src/ui/markdown/syntax/table_captions.ts test/checks/check-list-captions.mjs \
  test/checks/check-table-captions.mjs
git commit -m "feat(markdown): parse list caption lines"
```

---

### Task 2: Attach Captions to Lists and Keep Them in One Block

**Files:**
- Modify: `src/ui/markdown/mdast.d.ts`
- Modify: `src/ui/markdown/ast.ts`
- Modify: `src/ui/markdown/syntax/parser.ts`
- Modify: `src/ui/markdown/document/blocks.ts`
- Modify: `test/checks/check-block-splitting.mjs`
- Modify: `test/checks/check-parser.mjs`

**Interfaces:**
- Produces: `ListCaptionNode`
- Produces: `List.listCaption?: ListCaptionNode`
- Produces: parsed list position ending at the caption line and `list.source` containing the exact pair.

- [ ] **Step 1: Add failing parser and block-splitting checks**

Assert:

```js
const tree = parseMarkdown('- one\n- two\n\n: Steps {#list:steps}\n');
check('the list owns its caption', tree.children[0].type, 'list');
check('the caption is attached', tree.children[0].listCaption?.id, 'list:steps');
check('the caption paragraph is removed', tree.children.length, 1);
```

Splitting checks:

```js
check(
  'one blank keeps a direct caption in the list block',
  splitBlocks('- one\n\n: Caption\n').map((block) => block.text),
  ['- one\n\n: Caption\n']
);
check(
  'two blanks leave the colon as its own block',
  splitBlocks('- one\n\n\n: Caption\n').map((block) => block.text),
  ['- one', '', ': Caption\n']
);
```

- [ ] **Step 2: Run the checks and verify failure**

Run:

```sh
node test/checks/check-parser.mjs
node test/checks/check-block-splitting.mjs
```

Expected: list caption absent; separated caption is a separate block.

- [ ] **Step 3: Add the AST contract**

Add:

```ts
export interface ListCaptionNode {
  type: 'listCaption';
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  children: RootContent[];
  source: string;
  captionData: ListCaptionData;
  listFrom: number;
  separatorFrom: number | null;
  separated: boolean;
  position: {
    start: { offset: number };
    end: { offset: number };
  };
}
```

Augment mdast:

```ts
interface List {
  source?: string;
  listCaption?: ListCaptionNode;
}
```

Add `ListCaptionNode` to `AstNode`.

- [ ] **Step 4: Attach list captions in the parser**

After `restoreTableCaptions(root, markdown)`, call
`restoreListCaptions(root, markdown)`.

For each root-level list:

```ts
const start = list.position?.start.offset;
const end = list.position?.end.offset;
const attachment = listCaptionAfterList(markdown, start, end);
if (attachment === null) return;

list.position = {
  start: { offset: start },
  end: { offset: attachment.caption.captionTo }
};
list.source = markdown.slice(start, attachment.caption.captionTo);
list.listCaption = captionNode(..., attachment.caption);
```

Remove only following root nodes wholly inside the caption line. Reuse the same
inline-caption parsing helper as tables.

- [ ] **Step 5: Extend block slicing**

After list merging and before description-list merging, consume one blank line
plus a matching caption line:

```ts
if (list && j < lines.length && lines[j].text.trim() === '') {
  const captionLine = j + 1;
  if (
    captionLine < lines.length &&
    listCaptionLine(lines[captionLine].text, lines[captionLine].start) !== null
  ) {
    lineEnd = lines[captionLine].number;
    charEnd = lines[captionLine].end;
    j = captionLine + 1;
  }
}
```

The direct form is already inside the initial non-blank run. Two blank lines
must not enter this branch.

- [ ] **Step 6: Run parser and block checks**

Run:

```sh
node test/checks/check-parser.mjs
node test/checks/check-block-splitting.mjs
node test/checks/check-list-captions.mjs
```

Expected: all pass.

- [ ] **Step 7: Commit**

```sh
git add src/ui/markdown/mdast.d.ts src/ui/markdown/ast.ts \
  src/ui/markdown/syntax/parser.ts src/ui/markdown/document/blocks.ts \
  test/checks/check-parser.mjs test/checks/check-block-splitting.mjs
git commit -m "feat(markdown): attach captions to lists"
```

---

### Task 3: Render and Edit the List Caption

**Files:**
- Create: `src/ui/markdown/nodes/list_caption.ts`
- Modify: `src/ui/markdown/create_block.ts`
- Modify: `src/ui/markdown/editing/context.ts`
- Modify: `src/ui/markdown/render_context.ts`
- Modify: `src/ui/markdown/markdown_editor.ts`
- Modify: `src/styles.css`
- Create: `test/probes/list-caption-editing.js`

**Interfaces:**
- Produces: `ListCaption` revealable component.
- Produces: `RenderContext.listLabelAt(from): string | null`.
- Consumes: `ReferenceEntry` number and label through the shared render context.

- [ ] **Step 1: Write the failing Tauri probe**

Use a list with direct and separated captions. Assert:

- the block has `markdown-list-block`;
- the wrapper has only `list:steps` as its DOM ID;
- the caption displays `List 1. Steps`;
- clicking the caption shows `: Steps {#list:steps .wide}`;
- one Left from the attribute starts moves out of the caption source;
- typing edits the caption line, never the first item;
- leaving restores the rendered caption;
- Backspace at source start removes an optional blank separator;
- Enter at source start adds one.

- [ ] **Step 2: Run the probe and verify failure**

Run:

```sh
npm run tauri dev
npm run probe -- test/probes/list-caption-editing.js
```

Expected: no rendered list caption.

- [ ] **Step 3: Render the caption**

In `createBlock.ts`, when parsed children contain a list with `listCaption`:

```ts
element.classList.add('markdown-list-block');
if (caption.id !== null) element.id = caption.id;
element.appendChild(new ListCaption(caption).element);
```

`ListCaption` mirrors `TableCaption`, using `listLabelAt` and the classes
`markdown-list-caption`, `markdown-list-number`, and
`markdown-list-caption-source`.

- [ ] **Step 4: Make the caption revealable**

Add:

```ts
if (node.type === 'list' && node.listCaption) {
  const caption = node.listCaption.captionData;
  return offset >= caption.captionFrom && offset <= caption.captionTo
    ? { start: caption.captionFrom, end: caption.captionTo }
    : null;
}
```

before descending into list children in `sourceRangeIn`.

- [ ] **Step 5: Wire the label**

Add `listLabelAt` to `RenderContext`, the default no-answer object, and
`markdown_editor.ts`:

```ts
listLabelAt: (from) => {
  const target = this.state.referenceEntries().find(
    (entry) => entry.kind === 'list' && entry.from === from
  );
  return target?.number == null ? null : referenceLabel(target);
},
```

- [ ] **Step 6: Add the list caption styles**

Mirror the table caption:

```css
.markdown-list-block { display: block; }
.markdown-list-caption {
  margin-top: 0.25rem;
  text-align: left;
  font-size: 0.875em;
}
.markdown-list-caption-source {
  display: block;
  margin-top: 0.25rem;
  white-space: pre-wrap;
}
.markdown-list-number {
  font-weight: 600;
  white-space: nowrap;
}
```

Add `.markdown-list-caption-source` to both shared source selector lists.

- [ ] **Step 7: Run the probe**

Run:

```sh
npm run probe -- test/probes/list-caption-editing.js
```

Expected: all checks pass.

- [ ] **Step 8: Commit**

```sh
git add src/ui/markdown/nodes/list_caption.ts src/ui/markdown/create_block.ts \
  src/ui/markdown/editing/context.ts src/ui/markdown/render_context.ts \
  src/ui/markdown/markdown_editor.ts src/styles.css test/probes/list-caption-editing.js
git commit -m "feat(editor): render and edit list captions"
```

---

### Task 4: Index List Targets and Navigate to the First Item

**Files:**
- Modify: `src/ui/markdown/document/reference_index.ts`
- Modify: `test/checks/check-reference-index.mjs`
- Create: `test/probes/list-crossrefs.js`

**Interfaces:**
- Consumes: `List.listCaption`.
- Produces: `ReferenceEntry` with `kind: 'list'`, document-order number, caption title, label, prefix, and `caretAt`.

- [ ] **Step 1: Write failing index checks**

```js
const listDoc =
  '---\nreference-labels:\n  list: Procedure\n' +
  'reference-number-prefixes:\n  list: "3-"\n---\n\n' +
  '- first\n- second\n: Steps\n\n' +
  '3. third\n4. fourth\n: {#list:target}\n';
const lists = referenceIndex(listDoc).filter((entry) => entry.kind === 'list');
check('captioned lists are numbered', lists.map((entry) => entry.number), [1, 2]);
check('ID-only list is a target', lists[1].id, 'list:target');
check('configured list label and prefix survive', referenceLabel(lists[1]), 'Procedure 3-2');
check('navigation starts in the first item', listDoc.slice(lists[1].caretAt), 'third\n4. fourth\n: {#list:target}\n');
```

- [ ] **Step 2: Run and verify failure**

Run: `node test/checks/check-reference-index.mjs`

Expected: no `list` entries.

- [ ] **Step 3: Add list entries in document order**

Track `let listNumber = 0` beside figure/table counters. In `walk`:

```ts
if (child.type === 'list' && child.listCaption) addList(child);
```

`addList` uses:

```ts
listNumber += 1;
entries.push({
  id: caption.id,
  kind: 'list',
  from: start,
  to: caption.position.end.offset,
  number: listNumber,
  title: caption.children.map(plainText).join('').trim(),
  label: vocabulary.list.label,
  numberPrefix: vocabulary.list.prefix,
  caretAt: firstListContentOffset(child, start),
  explicit: caption.id !== null
});
```

`firstListContentOffset` walks first item -> first paragraph -> first inline
position, then falls back to item, paragraph, and list starts.

- [ ] **Step 4: Write the failing navigation probe**

Assert automatic text `List 1`, configured label/prefix, first item reveal,
caret placement, empty first-item placeholder, live insertion renumbering, and a
callout containing a captioned list.

- [ ] **Step 5: Run the probe**

Run: `npm run probe -- test/probes/list-crossrefs.js`

Expected before index work: reference remains unresolved. After index work: all
checks pass.

- [ ] **Step 6: Commit**

```sh
git add src/ui/markdown/document/reference_index.ts test/checks/check-reference-index.mjs \
  test/probes/list-crossrefs.js
git commit -m "feat(crossrefs): index captioned lists"
```

---

### Task 5: Shared HTML/EPUB/DOCX/ODT and Processed-Markdown Export

**Files:**
- Create: `src/ui/export/inline_html.ts`
- Create: `src/ui/export/list_html.ts`
- Create: `src/ui/export/list_rewrites.ts`
- Modify: `src/ui/export/table_html.ts`
- Modify: `src/ui/export/preprocess.ts`
- Modify: `src/ui/export/equation_rewrites.ts` only if ordering requires it
- Modify: `test/checks/check-export.mjs`
- Modify: `test/probes/export-{html,epub,docx,odt,markdown}.js`

**Interfaces:**
- Produces: `listRewrites(tree, references, kind): ListRewrite[]`
- Produces: `listHtml(list, label): string`
- Consumes: `ReferenceEntry(kind === 'list')` and `ListCaptionNode`.

- [ ] **Step 1: Add failing export checks**

Assert all non-LaTeX kinds receive the same semantic structure:

```markdown
::: {#list:steps .list-target .wide data-owner=demo}
1. First
2. Second

**List 1.** Steps
:::
```

For processed Markdown assert:

```html
<div id="list:steps" class="list-target wide" data-owner="demo">
  <ol>…</ol>
  <div class="list-caption"><span class="list-label">List 1.</span> Steps</div>
</div>
```

- [ ] **Step 2: Run and verify failure**

Run: `node test/checks/check-export.mjs`

Expected: caption syntax remains unchanged.

- [ ] **Step 3: Extract reusable inline HTML**

Move the inline node renderer from `table_html.ts` into `inline_html.ts` and
export `inlineHtml(nodes)` plus `visibleLabeledText(label, nodes)`.

- [ ] **Step 4: Implement non-LaTeX list rewrites**

For `html`, `epub`, `docx`, and `odt`, replace the complete list+caption span:

```ts
const listBody = list.source.slice(0, captionOffset - span.start).trimEnd();
return [
  `::: {${tokens.join(' ')}}`,
  listBody,
  '',
  `**${escapeMarkdown(label)}.**${caption === '' ? '' : ` ${caption}`}`,
  ':::'
].join('\n');
```

Tokens contain the optional ID, `.list-target`, classes, and key/value
attributes. Every one of the four kinds uses the same function.

- [ ] **Step 5: Render processed Markdown**

`listHtml` recursively renders:

- `<ol>` with `start` when non-default;
- `<ul>`;
- `<li>` for ordinary items;
- disabled checkbox input for task items;
- paragraphs as inline HTML;
- nested lists recursively;
- `data-*` attributes for key/value fields.

Then append:

```html
<div class="list-caption">
  <span class="list-label">List N.</span> Caption
</div>
```

- [ ] **Step 6: Add rewrites to preprocessing**

Add `...listRewrites(tree, references, answers.kind)` after `tableRewrites`.

- [ ] **Step 7: Extend the five export probes**

Each fixture gets labeled and caption-only lists. Probes assert:

- HTML/EPUB wrapper ID survives;
- DOCX wrapper becomes a bookmark and ODT a named section;
- HTML/EPUB/DOCX/ODT show the same caption and sequence;
- processed Markdown has list HTML and target;
- ordered starts, tasks, and nested lists survive.

- [ ] **Step 8: Run checks and probes**

Run:

```sh
node test/checks/check-export.mjs
npm run probe -- test/probes/export-html.js
npm run probe -- test/probes/export-epub.js
npm run probe -- test/probes/export-docx.js
npm run probe -- test/probes/export-odt.js
npm run probe -- test/probes/export-markdown.js
```

Expected: all pass.

- [ ] **Step 9: Commit**

```sh
git add src/ui/export/inline_html.ts src/ui/export/list_html.ts \
  src/ui/export/list_rewrites.ts src/ui/export/table_html.ts \
  src/ui/export/preprocess.ts test/checks/check-export.mjs \
  test/probes/export-html.js test/probes/export-epub.js \
  test/probes/export-docx.js test/probes/export-odt.js \
  test/probes/export-markdown.js
git commit -m "feat(export): render captioned lists"
```

---

### Task 6: LaTeX/PDF List Counter and References

**Files:**
- Modify: `src/ui/export/reference_header.ts`
- Modify: `src/ui/export/list_rewrites.ts`
- Modify: `src/ui/export/preprocess.ts`
- Modify: `test/checks/check-reference-header.mjs`
- Modify: `test/checks/check-export.mjs`
- Modify: `test/probes/export-latex.js`
- Modify: `test/probes/export-pdf.js`
- Create: `test/probes/export-pdf-list-template.js`

**Interfaces:**
- Produces: `\yiListRef{id}`.
- Produces: `\yiListCounterSetup`, `\yiListNumber`, `\yiListName`, and `yilist`.
- Automatic list references become `\yiListRef{id}` only for `latex` and `pdf`.

- [ ] **Step 1: Write failing header checks**

Assert the header contains:

```latex
\@ifundefined{c@yilist}{\newcounter{yilist}}{}
\providecommand{\yiListNumber}{\arabic{yilist}}
\renewcommand{\theyilist}{\yiListNumber}
\providecommand{\yiListCounterSetup}{}
\AtBeginDocument{%
  \yiListCounterSetup
  \renewcommand{\yiListName}{Procedure}%
  \renewcommand{\theyilist}{\mbox{3-}\yiListNumber}%
}
\providecommand{\yiListRef}[1]{%
  \hyperref[#1]{\yiListName~\ref*{#1}}%
}
```

- [ ] **Step 2: Run and verify failure**

Run: `node test/checks/check-reference-header.mjs`

Expected: no list macros.

- [ ] **Step 3: Generate the list header**

`referenceHeader` detects `entries.some((entry) => entry.kind === 'list')`.
It emits the counter setup only when a captioned list exists and escapes all
literal prefix text with the existing `latexText`.

- [ ] **Step 4: Lower LaTeX list captions**

For `latex` and `pdf`, preserve the list body and replace the caption line with:

```markdown
`\phantomsection\refstepcounter{yilist}\label{list:steps}\noindent\textbf{\yiListName~\theyilist.}`{=latex} Steps
```

For caption-only lists omit `\label`. For ID-only lists omit trailing caption
text. Keep a no-ID Div carrying classes and attributes around the list for
templates and filters, but do not duplicate the target ID.

- [ ] **Step 5: Route automatic references**

In `autoReferenceRewrites`, add:

```ts
if (target?.kind === 'list' && (kind === 'latex' || kind === 'pdf')) {
  return {
    start: span.start,
    end: span.end,
    text: `\\yiListRef{${latexLabel(node.id)}}`
  };
}
```

- [ ] **Step 6: Add PDF counter setup probe**

Copy a template package, define:

```tex
\makeatletter
\providecommand{\yiListCounterSetup}{}
\renewcommand{\yiListCounterSetup}{%
  \@addtoreset{yilist}{chapter}%
  \renewcommand{\yiListNumber}{\thechapter.\arabic{yilist}}%
}
\makeatother
```

Assert two captioned lists in different chapters produce `1.1`, `2.1`, and
automatic references match those values.

- [ ] **Step 7: Run checks and probes**

Run:

```sh
node test/checks/check-reference-header.mjs
node test/checks/check-export.mjs
npm run probe -- test/probes/export-latex.js
npm run probe -- test/probes/export-pdf.js
npm run probe -- test/probes/export-pdf-list-template.js
```

Expected: all pass.

- [ ] **Step 8: Commit**

```sh
git add src/ui/export/reference_header.ts src/ui/export/list_rewrites.ts \
  src/ui/export/preprocess.ts test/checks/check-reference-header.mjs \
  test/checks/check-export.mjs test/probes/export-latex.js \
  test/probes/export-pdf.js test/probes/export-pdf-list-template.js
git commit -m "feat(export): add native list references"
```

---

### Task 7: Default Fixture and Documentation Coverage

**Files:**
- Modify: `test/fixtures/workspace/default-document.md`
- Modify: `test/probes/equation-crossrefs.js` or create `test/probes/list-default-document.js`
- Modify: `test/README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/ai-context.md`
- Verify: `src/ui/documentation/documentation.*.md`

**Interfaces:**
- Consumes all list behavior above.
- Produces one default note that exercises every list caption and export case.

- [ ] **Step 1: Add fixture cases**

Add:

- caption-only bullet list;
- ID-only ordered list starting at 3;
- captioned task list with `.wide data-owner=demo`;
- nested list content;
- automatic and manual references;
- configured label and prefix for lists.

Use unique IDs and place one list before a table/equation to prove document-order
renumbering.

- [ ] **Step 2: Add a default-document Tauri probe**

Assert rendering, references, command-click, and configured labels in the
fixture.

- [ ] **Step 3: Update architecture and test index**

Document:

- `list_captions.ts` owns colon attachment;
- `list_rewrites.ts` owns writer output;
- HTML/EPUB/DOCX/ODT share one representation;
- `reference_header.ts` owns `yilist`.

- [ ] **Step 4: Run documentation and fixture checks**

Run:

```sh
node test/checks/check-documentation.mjs
npm run probe -- test/probes/list-default-document.js
```

Expected: pass in all eight Documentation languages and in the default note.

- [ ] **Step 5: Commit**

```sh
git add test/fixtures/workspace/default-document.md \
  test/probes/list-default-document.js test/README.md docs/architecture.md \
  docs/ai-context.md
git commit -m "test(lists): cover the default document"
```

---

### Task 8: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run static verification**

```sh
npx tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml
node test/checks/check-documentation.mjs
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Run the full Node checks**

```sh
npm run check
```

Expected: 69/69 or the new total, all passing. If the known LibreOffice ODT renderer fails with zero pages, restart LibreOffice's headless state and rerun that check before reporting success.

- [ ] **Step 3: Run every affected Tauri probe**

```sh
npm run probe -- test/probes/list-caption-editing.js
npm run probe -- test/probes/list-crossrefs.js
npm run probe -- test/probes/list-default-document.js
npm run probe -- test/probes/export-html.js
npm run probe -- test/probes/export-epub.js
npm run probe -- test/probes/export-docx.js
npm run probe -- test/probes/export-odt.js
npm run probe -- test/probes/export-markdown.js
npm run probe -- test/probes/export-latex.js
npm run probe -- test/probes/export-pdf.js
npm run probe -- test/probes/export-pdf-list-template.js
```

Expected: every probe passes.

- [ ] **Step 4: Run the full suite**

```sh
npm run probe:all
```

Expected: every probe passes or is intentionally skipped.

- [ ] **Step 5: Verify the final tree and report**

```sh
git status --short --branch
git diff --check main...HEAD
```

Expected: clean worktree, no whitespace errors, list commits present, no merge to
`main`.
