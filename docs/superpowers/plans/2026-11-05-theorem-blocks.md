# Theorem Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class Pandoc-amsthm-compatible theorem, definition, remark, and proof blocks with Yi-native `[#id]` references.

**Architecture:** A pure theorem domain resolves app defaults plus note frontmatter into one theorem vocabulary. The generic fenced-Div parser uses that vocabulary to normalize only declared classes, a semantic theorem node renders and edits them, the reference index assigns counters, and export preparation emits temporary `@Id` references for the pinned upstream Lua filter.

**Tech Stack:** TypeScript, unified/remark, mdast, YAML, Tauri, Pandoc Lua filters, Node checks, Tauri probes.

**Spec:** `docs/superpowers/specs/2026-11-05-theorem-blocks-design.md`

## Global Constraints

- The document text is the only source of truth; viewing a theorem never rewrites source.
- Structural fenced-Div parsing never depends on frontmatter; semantic classification does.
- `[#id]` is the only theorem-reference syntax. `@id` and `[@id]` remain citations.
- Dispatch references by resolved target kind, never by an ID prefix.
- Visible picker labels do not contain `amsthm`; choices are grouped and namespace their internal values.
- The theorem type class keeps the exact case used in `pandoc-amsthm` metadata.
- The upstream filter requires Pandoc 3.1.1 or later.
- Every production change starts with a failing test that is watched fail.
- Run affected tests after every task and commit once the task is green.

---

### Task 1: Resolve theorem vocabulary

**Files:**
- Create: `src/ui/markdown/syntax/theorem/model.ts`
- Create: `src/ui/markdown/syntax/theorem/vocabulary.ts`
- Create: `src/ui/markdown/syntax/theorem/index.ts`
- Create: `test/checks/check-theorem-vocabulary.mjs`
- Modify: `test/checks/module-layout.mjs`

**Interfaces:**
- Consumes: `yaml`'s `parseDocument`, the leading frontmatter text.
- Produces:
  - `TheoremType { className, displayName, style, counter, numbered, parentCounter }`
  - `TheoremVocabulary { types: readonly TheoremType[], byClass: ReadonlyMap<string, TheoremType>, key: string }`
  - `DEFAULT_THEOREM_VOCABULARY: TheoremVocabulary`
  - `theoremVocabularyFromFrontmatter(frontmatter: string | null): TheoremVocabulary`

- [ ] **Step 1: Write the failing vocabulary check**

```js
const { theoremVocabularyFromFrontmatter } = await load(
  'src/ui/markdown/syntax/theorem/index.ts',
  'theorem-vocabulary'
);

const custom = theoremVocabularyFromFrontmatter([
  'amsthm:',
  '  plain:',
  '    - Theorem:',
  '        - Lemma',
  '    - Conjecture',
  '  name_to_text:',
  '    Theorem: 定理',
  '    Conjecture: 猜想'
].join('\n'));

check(
  'a custom theorem is added',
  custom.byClass.get('Conjecture')?.displayName,
  '猜想'
);
check(
  'a nested theorem shares its parent counter',
  custom.byClass.get('Lemma')?.counter,
  'Theorem'
);
check(
  'the built-in proof stays available without metadata',
  theoremVocabularyFromFrontmatter(null).byClass.get('proof')?.numbered,
  false
);
```

Also assert malformed YAML falls back to defaults, duplicate classes are omitted, unsafe class names are
omitted, a trailing `*` is unnumbered, and an explicit `Theorem` style replaces its built-in style.

- [ ] **Step 2: Run the check and verify the module is missing**

Run: `node test/checks/check-theorem-vocabulary.mjs`

Expected: failure naming the missing theorem facade.

- [ ] **Step 3: Implement the value and resolver**

```ts
export interface TheoremType {
  className: string;
  displayName: string;
  style: 'plain' | 'definition' | 'remark' | string;
  counter: string;
  numbered: boolean;
  parentCounter: 'part' | 'chapter' | 'section' | 'subsection' |
    'subsubsection' | 'paragraph' | 'subparagraph' | null;
}

export interface TheoremVocabulary {
  types: readonly TheoremType[];
  byClass: ReadonlyMap<string, TheoremType>;
  key: string;
}
```

`theoremVocabularyFromFrontmatter` parses only YAML, starts from the built-in declarations, adds custom
types, merges `name_to_text`, and builds a deterministic `key` from the resolved declarations.

- [ ] **Step 4: Run the focused and layout checks**

Run: `node test/checks/check-theorem-vocabulary.mjs && node test/checks/module-layout.mjs`

Expected: both pass after adding the theorem domain to the module-layout allowlist.

- [ ] **Step 5: Commit**

```bash
git add src/ui/markdown/syntax/theorem test/checks/check-theorem-vocabulary.mjs test/checks/module-layout.mjs
git commit -m "feat(theorems): resolve theorem vocabulary"
```

---

### Task 2: Normalize declared theorem Divs into the parser AST

**Files:**
- Modify: `src/ui/markdown/syntax/callout/parser_source.ts`
- Create: `src/ui/markdown/syntax/theorem/reader.ts`
- Create: `src/ui/markdown/syntax/theorem/parser_source.ts`
- Create: `src/ui/markdown/plugins/remark-theorem.ts`
- Modify: `src/ui/markdown/syntax/theorem/index.ts`
- Modify: `src/ui/markdown/syntax/parser.ts`
- Modify: `src/ui/markdown/syntax/remark_pipeline.ts`
- Modify: `src/ui/markdown/mdast.d.ts`
- Modify: `src/ui/markdown/ast.ts`
- Create: `test/checks/check-theorem-parser.mjs`

**Interfaces:**
- Consumes: `TheoremVocabulary`, `readFencedDiv`, `attributeBlockAtEnd`.
- Produces:
  - `TheoremSource { theorem: TheoremType, id, info, from, to, markerFrom, markerTo, bodyFrom, bodyTo, source }`
  - `readTheorem(source: string, vocabulary: TheoremVocabulary): TheoremSource | null`
  - `theoremsForParsers(markdown: string, vocabulary: TheoremVocabulary): string`
  - `ParseOptions { theoremVocabulary?: TheoremVocabulary }`
  - `AstTheorem` mdast node with `theorem`, `children`, `position`.

- [ ] **Step 1: Write the failing parser checks**

```js
const source = [
  '---',
  'amsthm:',
  '  plain:',
  '    - Claim',
  '---',
  '',
  '::: {#claim:one .Claim info="First"}',
  'Body.',
  ':::'
].join('\n');
const tree = parseMarkdown(source);
check('a declared class becomes a theorem', nodesOfType(tree, 'theorem').length, 1);
check(
  'the theorem keeps its source position',
  sourceOf(source, nodesOfType(tree, 'theorem')[0]),
  '::: {#claim:one .Claim info="First"}\nBody.\n:::'
);
check(
  'an undeclared class stays a fenced Div',
  nodesOfType(parseMarkdown('::: {.Unknown}\nx\n:::'), 'theorem').length,
  0
);
check(
  'a theorem ID that cannot use the named filter form stays exact source',
  nodesOfType(parseMarkdown('::: {#Thm:one .Theorem}\nx\n:::'), 'theorem').length,
  0
);
```

Add nested theorem, quote-carrier, malformed fence, multiple theorem classes, callout/theorem nesting,
and exact source-length cases.

- [ ] **Step 2: Run the check and verify theorem normalization is absent**

Run: `node test/checks/check-theorem-parser.mjs`

Expected: zero theorem nodes where the test requires one.

- [ ] **Step 3: Implement theorem reading and offset-preserving directive preparation**

```ts
export function readTheorem(
  source: string,
  vocabulary: TheoremVocabulary
): TheoremSource | null {
  const div = readFencedDiv(source);
  if (div === null) return null;
  const opening = readDivOpening(sourceLines(source)[0]);
  if (opening === null) return null;
  const matches = opening.attribute.classes
    .map((name) => vocabulary.byClass.get(name))
    .filter(Boolean);
  return matches.length === 1
    ? theoremFrom(opening, matches[0]!, div, source)
    : null;
}
```

The parser-source transform replaces only the opening line with a same-length `:::theorem` directive.
Reuse the existing balanced, code-fence-aware scan rather than writing a second colon-fence walker.

- [ ] **Step 4: Add and order the remark theorem plugin**

```ts
export function remarkTheorems() {
  return (tree: Root, file: VFile): void => {
    const source = String(file);
    const vocabulary = file.data.theoremVocabulary as TheoremVocabulary;
    visitContainerDirectives(tree, (node) => {
      const theorem = readTheorem(source.slice(node.position.start.offset), vocabulary);
      return theorem === null ? null : theoremNode(theorem, node);
    });
  };
}
```

Run `remarkTheorems` before `remarkCallouts`. Pass `theoremVocabulary` through parser `file.data`, and
declare `theorem` in `mdast.d.ts` and `AstTheorem` in `ast.ts`.

- [ ] **Step 5: Run parser tests**

Run: `node test/checks/check-theorem-parser.mjs && node test/checks/check-parser.mjs && node test/checks/check-callouts.mjs && node test/checks/check-fenced-divs.mjs`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/markdown/syntax/callout/parser_source.ts \
  src/ui/markdown/syntax/theorem src/ui/markdown/plugins/remark-theorem.ts \
  src/ui/markdown/syntax/parser.ts src/ui/markdown/syntax/remark_pipeline.ts \
  src/ui/markdown/mdast.d.ts src/ui/markdown/ast.ts \
  test/checks/check-theorem-parser.mjs
git commit -m "feat(theorems): parse declared theorem divs"
```

---

### Task 3: Invalidate block parses when theorem declarations change

**Files:**
- Modify: `src/ui/markdown/document/state.ts`
- Modify: `src/ui/markdown/document/block/parse_cache.ts`
- Modify: `test/checks/check-document-revision.mjs`
- Create: `test/checks/check-theorem-reparse.mjs`

**Interfaces:**
- Consumes: `theoremVocabularyFromFrontmatter`, `ParseOptions`.
- Produces:
  - `MarkdownEditorState.theoremVocabulary(): TheoremVocabulary`
  - `BlockParseCache` receives the current vocabulary and includes its key for blocks containing `:::`.

- [ ] **Step 1: Write the failing cache check**

```js
const state = new MarkdownEditorState();
state.loadText('::: {.Claim}\nBody.\n:::');
check('an undeclared theorem is not parsed', nodesOfType(state.getBlockContent(state.getBlocks()[0]), 'theorem').length, 0);
state.setText([
  '---',
  'amsthm:',
  '  plain:',
  '    - Claim',
  '---',
  '',
  '::: {.Claim}',
  'Body.',
  ':::'
].join('\n'));
const theoremBlock = state.getBlocks().find((block) => block.text.includes('.Claim'));
check('adding a declaration reparses the Div', nodesOfType(state.getBlockContent(theoremBlock), 'theorem').length, 1);
state.setText('::: {.Claim}\nBody.\n:::');
const removedBlock = state.getBlocks()[0];
check('removing it restores exact source', nodesOfType(state.getBlockContent(removedBlock), 'theorem').length, 0);
```

- [ ] **Step 2: Run the check and verify the stale parse**

Run: `node test/checks/check-theorem-reparse.mjs`

Expected: the second theorem-node count is 0 because the block parse was cached.

- [ ] **Step 3: Cache the vocabulary and include its key in Div parse keys**

```ts
theoremVocabulary(): TheoremVocabulary {
  this.cachedTheoremVocabulary ??=
    theoremVocabularyFromFrontmatter(readFrontmatterBlock(this.getText()));
  return this.cachedTheoremVocabulary;
}

// BlockParseCache.key
return block.text.includes(':::')
  ? `${base}:theorems@${this.vocabulary.key}`
  : base;
```

Clear `cachedTheoremVocabulary` in `updateText`, and pass it into `parseMarkdown` from
`BlockParseCache.get`.

- [ ] **Step 4: Run cache and document checks**

Run: `node test/checks/check-theorem-reparse.mjs && node test/checks/check-document-revision.mjs && node test/checks/check-block-index.mjs`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/markdown/document/state.ts src/ui/markdown/document/block/parse_cache.ts \
  test/checks/check-theorem-reparse.mjs test/checks/check-document-revision.mjs
git commit -m "fix(theorems): reparse divs after metadata edits"
```

---

### Task 4: Render and edit theorem blocks

**Files:**
- Create: `src/ui/markdown/nodes/theorem.ts`
- Modify: `src/ui/markdown/create_node.ts`
- Modify: `src/ui/markdown/create_block.ts`
- Modify: `src/ui/markdown/source_mode/block.ts`
- Modify: `src/ui/markdown/block_views/source.ts`
- Modify: `src/ui/markdown/render_context.ts`
- Modify: `src/ui/markdown/editor/render_context.ts`
- Modify: `src/styles.css`
- Create: `test/probes/theorem-blocks.js`

**Interfaces:**
- Consumes: `AstTheorem`, `TheoremSource`, `renderContext().theoremLabelAt(from)`.
- Produces:
  - `.markdown-theorem`, `.markdown-theorem-title`, `.markdown-theorem-body`
  - `renderContext().theoremLabelAt(from): string | null`
  - exact-source mode through the existing `FencedDivSourceView`.

- [ ] **Step 1: Write the failing Tauri probe**

```js
await t.load([
  '::: {#thm:one .Theorem info="First"}',
  'The body has **weight**.',
  ':::',
  '',
  'See [#thm:one].'
].join('\n'));
check(
  'the theorem title is visible',
  t.prose().querySelector('.markdown-theorem-title')?.textContent?.trim(),
  'Theorem 1 (First).'
);
check(
  'the body renders markdown',
  t.prose().querySelector('.markdown-theorem-body strong')?.textContent,
  'weight'
);
```

```js
await t.load([
  '---',
  'amsthm:',
  '  name_to_text:',
  '    Theorem: 定理',
  '    proof: 证明',
  '---',
  '',
  '::: {#thm:local .Theorem}',
  '本地内容。',
  ':::',
  '',
  '::: proof',
  '显然。',
  ':::'
].join('\n'));
check(
  'the theorem uses the note-owned localized title',
  t.prose().querySelector('.markdown-theorem-title')?.textContent?.trim(),
  '定理 1.'
);
check(
  'the proof is named and carries one QED mark',
  [...t.prose().querySelectorAll('.markdown-theorem-title')][1]?.textContent?.trim(),
  '证明.'
);
check(
  'and a proof has exactly one QED mark',
  t.prose().querySelectorAll('.markdown-theorem-qed').length,
  1
);
t.prose().querySelector('.markdown-theorem-title')?.click();
await t.sleep(250);
check(
  'clicking the theorem title reveals its exact source',
  t.prose().querySelector('.markdown-fenced-div-source')?.textContent,
  '::: {#thm:local .Theorem}\n本地内容。\n:::'
);
```

- [ ] **Step 2: Run the probe against a freshly restarted app**

Run: `npm run tauri dev`

Run: `npm run probe -- test/probes/theorem-blocks.js`

Expected: failure because `.markdown-theorem` is not rendered.

- [ ] **Step 3: Render the theorem surface and source mode**

```ts
export class Theorem extends EditableNodeComponent {
  constructor(node: AstTheorem) {
    const element = document.createElement('section');
    super('theorem', node, element, 'markdown-theorem');
    const title = document.createElement('h4');
    title.className = 'markdown-theorem-title';
    title.textContent = renderContext().theoremLabelAt(node.position!.start.offset!) ??
      node.theorem.theorem.displayName;
    title.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      enterSourceOf(this.element, node.theorem.markerFrom);
    });
    element.append(title, renderTheoremBody(node));
  }
}
```

Pass `theoremRecognized` from `createBlockComponent` into `isSourceBlock`. For a declared theorem, show
source only while the caret is inside it; use `FencedDivSourceView` for the exact bytes.

- [ ] **Step 4: Add the theorem label to the render context**

```ts
theoremLabelAt: (from) => {
  const target = state.referenceEntries()
    .find((entry) => entry.kind === 'theorem' && entry.from === from);
  return target ? referenceLabel(target) : null;
},
```

Add the empty answer to the default render context.

- [ ] **Step 5: Run the probe and existing callout probes**

Run: `npm run probe -- test/probes/theorem-blocks.js`

Run: `npm run probe -- test/probes/callout-rendering.js`

Run: `npm run probe -- test/probes/pandoc-div-source-mode.js`

Expected: all focused probes pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/markdown/nodes/theorem.ts src/ui/markdown/create_node.ts \
  src/ui/markdown/create_block.ts src/ui/markdown/source_mode/block.ts \
  src/ui/markdown/block_views/source.ts src/ui/markdown/render_context.ts \
  src/ui/markdown/editor/render_context.ts src/styles.css test/probes/theorem-blocks.js
git commit -m "feat(theorems): render and edit theorem blocks"
```

---

### Task 5: Add theorem targets and number shared counters

**Files:**
- Modify: `src/ui/markdown/syntax/reference_vocabulary.ts`
- Modify: `src/ui/markdown/document/reference_index.ts`
- Modify: `test/checks/check-reference-index.mjs`
- Modify: `test/checks/check-reference-vocabulary.mjs`

**Interfaces:**
- Consumes: theorem AST nodes and `TheoremVocabulary`.
- Produces: `ReferenceKind` includes `'theorem'`; ID-less theorem blocks consume counters; shared
  counters resolve; `referenceLabel` returns the localized type plus number.

- [ ] **Step 1: Write failing reference checks**

```js
const theoremSource = [
  '::: {#thm:one .Theorem}',
  'One.',
  ':::',
  '',
  '::: {.Lemma}',
  'Shared two.',
  ':::',
  '',
  '::: {#thm:three .Theorem}',
  'Three.',
  ':::',
  '',
  'See [#thm:three].'
].join('\n');
const entries = referenceIndex(theoremSource)
  .filter((entry) => entry.kind === 'theorem');
check('the ID-less lemma consumes the shared counter', entries.map((entry) => entry.number), [1, 2, 3]);
check('the theorem reference reads as its type and number', referenceLabel(entries[2]), 'Theorem 3');
```

Add `name_to_text`, unnumbered proof, parent-counter, duplicate ID, and reference-before-target cases.

- [ ] **Step 2: Run the checks and verify no theorem entries exist**

Run: `node test/checks/check-reference-index.mjs && node test/checks/check-reference-vocabulary.mjs`

Expected: theorem entry count is 0.

- [ ] **Step 3: Collect theorem entries during the ordered parse walk**

```ts
export type ReferenceKind =
  | 'heading' | 'figure' | 'listing' | 'table' | 'equation' | 'list' | 'theorem';
```

The reference index maintains heading counters and theorem counters in document order. Each numbered
theorem increments `type.counter`; shared children use their parent's counter. Store the formatted
counter as `entry.number` and the theorem display name as `entry.label`.

- [ ] **Step 4: Run reference tests**

Run: `node test/checks/check-reference-index.mjs && node test/checks/check-reference-vocabulary.mjs && node test/checks/check-auto-references.mjs`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/markdown/syntax/reference_vocabulary.ts \
  src/ui/markdown/document/reference_index.ts \
  test/checks/check-reference-index.mjs test/checks/check-reference-vocabulary.mjs
git commit -m "feat(theorems): number theorem reference targets"
```

---

### Task 6: Serialize theorem references only for Pandoc

**Files:**
- Modify: `src/ui/export/pipeline/preprocess.ts`
- Modify: `src/ui/export/pipeline/contracts.ts`
- Modify: `src/ui/export/workflow/request.ts`
- Modify: `test/checks/check-export.mjs`

**Interfaces:**
- Consumes: `ReferenceEntry.kind === 'theorem'`.
- Produces: `ExportAnswers.citationKeys: ReadonlySet<string>`; Pandoc kinds receive `@Id`; processed
  Markdown receives a normal visible link; citations remain unchanged; theorem/citation ID collisions
  are refused before conversion.

- [ ] **Step 1: Write failing export checks**

```js
const theorem = [
  '::: {#thm:one .Theorem}',
  'Body.',
  ':::',
  '',
  'See [#thm:one] and [@smith2020].'
].join('\n');
const pandoc = await render(theorem, { kind: 'latex' });
check('a theorem reference uses the filter spelling', pandoc.rendered.includes('See @Thm:one'), true);
check('an ordinary citation is untouched', pandoc.rendered.includes('[@smith2020]'), true);
const markdown = await render(theorem, { kind: 'markdown' });
check(
  'processed Markdown gets a visible link',
  markdown.rendered.includes('See [Theorem 1](#thm:one)'),
  true
);
let collisionError = null;
try {
  await render(theorem, {
    kind: 'latex',
    citationKeys: new Set(['thm:one'])
  });
} catch (error) {
  collisionError = String(error);
}
check(
  'a theorem ID cannot silently claim a bibliography key',
  collisionError,
  'theorem reference thm:one collides with a citation key'
);
```

- [ ] **Step 2: Run the export check and verify the current link output**

Run: `node test/checks/check-export.mjs`

Expected: theorem source still lowers to a Markdown link when the kind is `latex`.

- [ ] **Step 3: Add theorem dispatch after target resolution**

```ts
if (target?.kind === 'theorem' && kind !== 'markdown') {
  return {
    start: span.start,
    end: span.end,
    text: `@${capitalizeAscii(target.id!)}`
  };
}
```

Keep the existing link fallback for processed Markdown and unresolved targets. Do not touch the
citation plugin. Before building `@Id`, refuse a theorem ID present in
`answers.citationKeys`. The workflow supplies the keys from `bibliographyManager.entries()` and turns
the pure failure into a localized reader-facing error.

- [ ] **Step 4: Run the export check**

Run: `node test/checks/check-export.mjs`

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/export/pipeline/preprocess.ts test/checks/check-export.mjs
git commit -m "feat(theorems): bridge references for pandoc"
```

---

### Task 7: Replace the callout picker with a grouped Div-kind picker

**Files:**
- Create: `src/ui/markdown/editing/div_kind_picker.ts`
- Delete: `src/ui/markdown/editing/callout_kind_picker.ts`
- Modify: `src/ui/markdown/editing/fence_open.ts`
- Modify: `src/ui/markdown/markdown_editor.ts`
- Modify: `src/ui/markdown/choice_card.ts`
- Modify: `src/ui/markdown/syntax/theorem/index.ts`
- Modify: `test/probes/callout-div-open.js`
- Modify: `test/probes/pandoc-div-container.js`
- Modify: `test/probes/container-fence-open.js`
- Modify: `test/probes/picker-keyboard.js`
- Create: `test/probes/div-kind-picker.js`

**Interfaces:**
- Consumes: `TheoremVocabulary`, `calloutKindEdit`.
- Produces:
  - `DivKindChoice { value, label, group }`
  - `theoremKindEdit(text: string, className: string, offset?: number): TextEdit | null`
  - `chooseDivKind(anchor, current, lineStart, choices)`

- [ ] **Step 1: Write the failing picker probe**

```js
await t.load([
  '---',
  'amsthm:',
  '  plain:',
  '    - Claim',
  '---',
  '',
  '::: ',
  '',
  ':::'
].join('\n'));
const rows = [...document.querySelectorAll('[data-div-kind-choice]')];
check('the picker has a theorem group', [...document.querySelectorAll('[data-choice-group]')]
  .map((node) => node.textContent), ['Callout', 'Theorem']);
check('the custom theorem is offered', rows.some((row) =>
  row.getAttribute('data-div-kind-choice') === 'theorem:Claim'), true);
check('the callout Definition remains distinct', rows.some((row) =>
  row.getAttribute('data-div-kind-choice') === 'callout:definition'), true);
```

Arrow onto `theorem:Claim`, press Enter, and assert the opening becomes
`::: {.Claim}`.

- [ ] **Step 2: Run the probe and verify the old seven-choice picker**

Run: `npm run probe -- test/probes/div-kind-picker.js`

Expected: no `data-div-kind-choice` rows.

- [ ] **Step 3: Add optional group headings to `ChoiceCard`**

```ts
export interface Choice {
  value: string;
  label: string;
  group?: string;
}
```

`draw()` appends a non-button `[data-choice-group]` heading when the group changes. `choices`,
selection, arrows, Home/End and filtering continue to contain selectable rows only.

- [ ] **Step 4: Supply callout and theorem groups from the document vocabulary**

```ts
function divKindChoices(vocabulary: TheoremVocabulary): Choice[] {
  return [
    { value: 'default', label: 'Default' },
    ...calloutChoices('Callout'),
    ...vocabulary.types.map((type) => ({
      value: `theorem:${type.className}`,
      label: type.displayName,
      group: 'Theorem'
    }))
  ];
}
```

The editor dispatches `callout:` values to `calloutKindEdit` and `theorem:` values to
`theoremKindEdit`. The theorem editor changes only the matching class token and preserves IDs,
`info`, unrelated classes, and other attributes.

- [ ] **Step 5: Run picker and callout probes**

Run: `npm run probe -- test/probes/div-kind-picker.js`

Run: `npm run probe -- test/probes/callout-div-open.js`

Run: `npm run probe -- test/probes/picker-keyboard.js`

Run: `npm run probe -- test/probes/pandoc-div-container.js`

Expected: all focused probes pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/markdown/editing/div_kind_picker.ts \
  src/ui/markdown/editing/callout_kind_picker.ts \
  src/ui/markdown/editing/fence_open.ts src/ui/markdown/markdown_editor.ts \
  src/ui/markdown/choice_card.ts src/ui/markdown/syntax/theorem/index.ts \
  test/probes/callout-div-open.js test/probes/pandoc-div-container.js \
  test/probes/container-fence-open.js test/probes/picker-keyboard.js \
  test/probes/div-kind-picker.js
git commit -m "feat(theorems): group theorem div choices"
```

---

### Task 8: Integrate the pinned Pandoc-amsthm filter

**Files:**
- Create: `src-tauri/assets/export/amsthm.lua`
- Create: `src-tauri/assets/export/amsthm.LICENSE`
- Modify: `src-tauri/src/export/run/arguments.rs`
- Modify: `src-tauri/src/export/run/mod.rs`
- Modify: `src-tauri/src/export/run/environment.rs`
- Modify: `src-tauri/src/export/pandoc.rs`
- Modify: `src-tauri/src/export/tests/run/arguments.rs`
- Modify: `src-tauri/src/export/tests/pandoc.rs`
- Modify: `test/probes/export-pandoc-arguments.js`
- Modify: `test/probes/fake-pandoc.sh`

**Interfaces:**
- Consumes: bundled filter path and theorem metadata in export source.
- Produces: `--lua-filter <absolute bundled path>` before the defaults' citeproc filter.
- Produces: a cached `pandoc --version` probe that refuses versions below 3.1.1 when theorem metadata
  is present.

- [ ] **Step 1: Write the failing Pandoc-argument test**

```rust
let theorem_filter = arguments
    .iter()
    .position(|argument| argument == "--lua-filter")
    .expect("the theorem filter is handed to pandoc");
let defaults = arguments
    .iter()
    .position(|argument| argument == "--defaults")
    .unwrap();
assert!(theorem_filter < defaults);
assert!(arguments[theorem_filter + 1].to_string_lossy().ends_with("amsthm.lua"));
```

```rust
#[test]
fn theorem_export_refuses_pandoc_before_three_one_one() {
    assert_eq!(supported_theorem_pandoc("3.1.0"), false);
    assert_eq!(supported_theorem_pandoc("3.1.1"), true);
    assert_eq!(supported_theorem_pandoc("3.12.1"), true);
}
```

- [ ] **Step 2: Run the focused Rust test and verify the argument is absent**

Run: `cargo test export::tests::run::arguments::theorem_filter`

Expected: failure because `--lua-filter` is absent.

- [ ] **Step 3: Vendor the filter and add one argument path**

Use the released `amsthm.lua` from `https://github.com/ickc/pandoc-amsthm/releases` and retain the
BSD-3-Clause notice. Resolve the asset with Tauri's resource path, then prepend:

```rust
arguments.push(OsString::from("--lua-filter"));
arguments.push(amsthm_filter.as_os_str().to_os_string());
```

Do not fetch the filter at runtime.

Read `pandoc --version` once per export call, parse the first version number, and return the localized
`export.theoremPandocTooOld` error before writing the note when the version is lower than `3.1.1`.

- [ ] **Step 4: Materialize default theorem metadata for Pandoc only**

Add a source preparation step before `exportSource` dispatch:

```ts
const theoremSource = materializeTheoremMetadata(text);
```

It merges the built-in declarations into the temporary frontmatter without changing the editor's
document. Existing declarations win; `name_to_text` and options merge per the spec.

- [ ] **Step 5: Run Rust and argument probes**

Run: `cargo test export::tests::run::arguments`

Run: `npm run probe -- test/probes/export-pandoc-arguments.js`

Expected: the filter path appears before `--defaults`, and the temporary note contains merged theorem
metadata.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/assets/export/amsthm.lua src-tauri/assets/export/amsthm.LICENSE \
  src-tauri/src/export/run/arguments.rs src-tauri/src/export/run/mod.rs \
  src-tauri/src/export/run/environment.rs src-tauri/src/export/tests/run/arguments.rs \
  test/probes/export-pandoc-arguments.js test/probes/fake-pandoc.sh
git commit -m "feat(export): run the bundled amsthm filter"
```

---

### Task 9: Document, exercise, and verify the complete feature

**Files:**
- Modify: `src/ui/documentation/en.md`
- Modify: `src/ui/documentation/*.md` for translated callout-picker text
- Modify: `test/fixtures/workspace/default-document.md`
- Modify: `test/probes/theorem-blocks.js`
- Modify: `test/checks/check-documentation.mjs`
- Modify: `test/checks/check-theorem-vocabulary.mjs`
- Modify: `test/checks/check-theorem-parser.mjs`
- Modify: `docs/architecture.md`
- Modify: `docs/ai-context.md`
- Modify: `test/README.md`

- [ ] **Step 1: Add a fixture example and documentation assertions**

```markdown
::: {#thm:fixture .Theorem info="Fixture"}
Every theorem fixture has a body.
:::

See [#thm:fixture].
```

Document the metadata contract, custom declarations, grouped picker, `[#id]` references, proof,
localized `name_to_text`, and the export boundary.

- [ ] **Step 2: Run documentation and fixture checks**

Run: `node test/checks/check-documentation.mjs && node test/checks/check-theorem-vocabulary.mjs && node test/checks/check-theorem-parser.mjs`

Expected: pass with no placeholders.

- [ ] **Step 3: Restart the app on the final branch**

Stop the running development app and restart `npm run tauri dev`.

- [ ] **Step 4: Run focused probes**

Run: `npm run probe -- test/probes/theorem-blocks.js`

Run: `npm run probe -- test/probes/div-kind-picker.js`

Run: `npm run probe -- test/probes/export-pandoc-arguments.js`

Run: `npm run probe -- test/probes/callout-rendering.js`

Run: `npm run probe -- test/probes/pandoc-div-source-mode.js`

Expected: all focused probes pass.

- [ ] **Step 5: Run the complete required verification**

Run: `npx tsc --noEmit`

Run: `cargo test`

Run: `npm run check`

Run: `npm run probe:all`

Expected: every command exits zero; skipped probes are only those whose headers declare an unavailable
machine dependency.

- [ ] **Step 6: Commit**

```bash
git add src/ui/documentation test/fixtures/workspace/default-document.md \
  test/checks/check-documentation.mjs test/checks/check-theorem-vocabulary.mjs \
  test/checks/check-theorem-parser.mjs docs/architecture.md docs/ai-context.md \
  test/README.md test/probes/theorem-blocks.js
git commit -m "docs(theorems): document and exercise theorem blocks"
```

## Completion Criteria

- All tasks are checked off.
- `npx tsc --noEmit`, `cargo test`, `npm run check`, and `npm run probe:all` pass on the final tree.
- The branch is `codex/theorem-blocks`; no commit lands on `main`.
- The final report names each behavior proven by a failing-then-passing check or probe.
