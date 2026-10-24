# Figure Cross-References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared `[#id]` references and document-wide figure numbering, then support Pandoc-style figure attributes, captions, navigation, and cross-format export.

**Architecture:** A text transformer creates `autoReference` nodes while `parseMarkdown` creates custom `figure` nodes from standalone attributed images. A generic document index adds heading and figure targets, and the render context turns target IDs into displayed reference text. Export preprocess rewrites automatic references to ordinary links and lowers figures to writer-safe anchors or processed-Markdown HTML.

**Tech Stack:** TypeScript, unified/remark/mdast, Tauri MCP probes, Node rolldown checks, Pandoc 3.12.

**Specs:**
- `docs/superpowers/specs/2026-10-24-cross-reference-targets-design.md`
- `docs/superpowers/specs/2026-10-24-figure-cross-references-design.md`

## Global Constraints

- Work only on `codex/figure-cross-references`; never merge without an explicit request.
- Test through the running Tauri app with `npm run probe`; restart after branch changes.
- Keep syntax modules DOM-free and under the layering checks.
- Preserve the source text as the only truth.
- Same-document references only.
- Every implicit figure is captioned and numbered.
- Only figures with explicit IDs are reference destinations.
- Automatic references render `Figure N`, `Table N`, `Listing N`, `Equation (N)`, or `List N` through localized labels.
- LaTeX/PDF uses native figure counter text; other rendered export kinds get a numbered caption.
- Processed Markdown uses `<figure>` HTML so common Markdown editors show it.
- Do not require `cleveref`.

---

### Task 1: Parse and render automatic references

**Files:**
- Create: `src/ui/markdown/syntax/auto_references.ts`
- Create: `test/checks/check-auto-references.mjs`

**Interfaces:**

```ts
export interface AutoReferenceSpan {
  from: number;
  to: number;
  id: string;
}

export function autoReferenceSpans(text: string): AutoReferenceSpan[];
```

Rules:

- recognize `[#id]`;
- reject an empty ID and line breaks;
- skip an escaped `\[#id]`;
- report source-relative offsets for the whole `[#id]` and inner ID.

- [ ] **Step 1: Write failing checks**

```js
check('a reference reports its source and id', autoReferenceSpans('See [#fig:model].'), [
  { from: 4, to: 16, id: 'fig:model' }
]);
check('escaped references stay text', autoReferenceSpans('\\[#fig:model]'), []);
check('empty references stay text', autoReferenceSpans('[#]'), []);
check('line breaks end the search', autoReferenceSpans('[#fig:\nmodel]'), []);
```

- [ ] **Step 2: Run the check and verify it fails**

Run `node test/checks/check-auto-references.mjs`.

- [ ] **Step 3: Implement the pure scanner and pass the check**

Run the check again and then `npm run check`.

- [ ] **Step 4: Add the remark transformer and node**

Create `src/ui/markdown/plugins/remark-auto-references.ts`, augment mdast with
`autoReference`, and split text nodes into text/reference/text children while
preserving source positions. Register it in both parse pipelines and the
stringifier.

Create `src/ui/markdown/nodes/auto_reference.ts` as a revealable inline node.
Its normal form is an `<a href="#id">`; its source form is `[#id]`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/markdown/syntax/auto_references.ts \
  src/ui/markdown/plugins/remark-auto-references.ts \
  src/ui/markdown/nodes/auto_reference.ts src/ui/markdown/mdast.d.ts \
  src/ui/markdown/ast.ts src/ui/markdown/registry.ts \
  src/ui/markdown/create_node.ts src/ui/markdown/syntax/parser.ts \
  test/checks/check-auto-references.mjs
git commit -m "feat(markdown): parse automatic cross-references"
```

---

### Task 2: Add the shared target index and resolved text

**Files:**
- Create: `src/ui/markdown/document/reference_index.ts`
- Create: `test/checks/check-reference-index.mjs`
- Modify: `src/ui/markdown/document/state.ts`
- Modify: `src/ui/markdown/render_context.ts`
- Modify: `src/ui/markdown/markdown_editor.ts`
- Modify: `src/ui/markdown/nodes/heading.ts`
- Modify: `locales/*.json`

**Interfaces:**

```ts
type ReferenceKind = 'heading' | 'figure';

interface ReferenceEntry {
  id: string | null;
  kind: ReferenceKind;
  from: number;
  to: number;
  number: number | null;
  title: string;
  explicit: boolean;
}

export function referenceIndex(markdown: string): ReferenceEntry[];
export function firstReference(
  entries: readonly ReferenceEntry[],
  id: string
): ReferenceEntry | null;
export function referenceLabel(
  entry: ReferenceEntry,
  kindName: (kind: ReferenceKind) => string
): string;
```

- [ ] **Step 1: Write failing index checks**

Test heading IDs, duplicates, title fallback, and an inserted duplicate changing
which heading is canonical. Use the existing `check-heading-index.mjs` loader.

- [ ] **Step 2: Implement the index and state cache**

Reuse heading parsing and Pandoc ID generation. Add
`MarkdownEditorState.referenceEntries()`. Keep `headingTargets()` as a filtered
compatibility view.

- [ ] **Step 3: Add render-context answers**

Extend `RenderContext`:

```ts
referenceText(id: string): { text: string; resolved: boolean };
```

In `markdown_editor.ts`, resolve through `state.referenceEntries()` and localized
kind labels. A heading returns its title. Unknown references return `#id` with
`resolved: false`.

- [ ] **Step 4: Prove auto-reference rendering**

Create `test/probes/auto-references.js`:

- a resolved heading renders `[#heading]` as a link titled by the heading;
- a plain click shows `[#heading]`;
- command-click reaches the heading;
- an unknown reference is visibly unresolved and does not navigate.

- [ ] **Step 5: Run checks and probes**

```bash
node test/checks/check-auto-references.mjs
node test/checks/check-reference-index.mjs
npx tsc --noEmit
npm run check
npm run probe -- --with-workspace --fixture default-document.md test/probes/auto-references.js
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/markdown/document/reference_index.ts \
  src/ui/markdown/document/state.ts src/ui/markdown/render_context.ts \
  src/ui/markdown/markdown_editor.ts src/ui/markdown/nodes/heading.ts \
  src/ui/markdown/nodes/auto_reference.ts locales \
  test/checks/check-reference-index.mjs test/probes/auto-references.js
git commit -m "feat(editor): resolve automatic cross-references"
```

---

### Task 3: Parse figures and expose their target data

**Files:**
- Create: `src/ui/markdown/syntax/pandoc_attributes.ts`
- Modify: `src/ui/markdown/syntax/heading_attributes.ts`
- Create: `src/ui/markdown/syntax/figures.ts`
- Create: `test/checks/check-figures.mjs`
- Modify: `src/ui/markdown/syntax/parser.ts`
- Modify: `src/ui/markdown/mdast.d.ts`
- Modify: `src/ui/markdown/ast.ts`

**Interfaces:**

```ts
interface FigureNode {
  type: 'figure';
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  source: string;
  children: [Image];
  position?: Position;
}

export function restoreFigures(tree: Root, markdown: string): void;
```

- [ ] **Step 1: Extract shared Pandoc attribute tokens**

Move token scanning/parsing out of `heading_attributes.ts` into a pure
`pandoc_attributes.ts`. Keep heading behavior unchanged and run its checks.

- [ ] **Step 2: Write failing figure checks**

Cover:

```js
shape('![Caption](a.png)\n') === 'figure(image)'
shape('Before ![Caption](a.png) after\n') === 'paragraph(text,image,text)'
shape('![](a.png)\n') === 'paragraph(image)'
shape('![Caption](a.png){#fig:a .wide width=80%}\n') === 'figure(image)'
```

Also assert the parsed ID/classes/attributes, malformed trailing braces, image
title preservation, and exact serialization.

- [ ] **Step 3: Implement `restoreFigures`**

Run it after all existing parser repairs. It replaces a paragraph containing only
one non-empty-alt image and optional valid attributes with one `figure` node.
It must skip inline images, images in links, empty-alt images, and code.

- [ ] **Step 4: Serialize the figure**

Add a stringify handler that writes the stored native source exactly.

- [ ] **Step 5: Extend the reference index**

Collect figures in document order and assign `Figure 1`, `Figure 2`, including
figures without IDs. Only entries with IDs are referencable.

- [ ] **Step 6: Run checks**

```bash
node test/checks/check-figures.mjs
node test/checks/check-heading-attributes.mjs
node test/checks/check-reference-index.mjs
npm run check
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/markdown/syntax/pandoc_attributes.ts \
  src/ui/markdown/syntax/heading_attributes.ts \
  src/ui/markdown/syntax/figures.ts src/ui/markdown/syntax/parser.ts \
  src/ui/markdown/mdast.d.ts src/ui/markdown/ast.ts \
  test/checks/check-figures.mjs test/checks/check-reference-index.mjs
git commit -m "feat(markdown): parse figure targets"
```

---

### Task 4: Render figure captions, numbers, and source editing

**Files:**
- Create: `src/ui/markdown/nodes/figure.ts`
- Modify: `src/ui/markdown/create_node.ts`
- Modify: `src/ui/markdown/registry.ts`
- Modify: `src/ui/markdown/render_context.ts`
- Modify: `src/ui/markdown/markdown_editor.ts`
- Modify: `src/ui/markdown/editing/context.ts`
- Modify: `src/ui/markdown/caret/offsets.ts`
- Modify: `src/styles.css`
- Create: `test/probes/figure-rendering.js`

**Interfaces:**

- `RenderContext.figureNumber(from: number): number | null`.
- `figure` is a revealable block node whose source view is the complete image
  Markdown plus attributes.
- Normal rendering is `<figure id="…"><img><figcaption>Figure N. Caption</figcaption></figure>`.

- [ ] **Step 1: Write the failing probe**

Load:

```markdown
See [#fig:model].

![Model overview](https://placehold.co/200x80/png){#fig:model .wide}
```

Assert:

- automatic reference text is `Figure 1`;
- the image has a visible caption `Figure 1. Model overview`;
- the `<figure>` has `id="fig:model"` but not class `wide`;
- a plain click reveals the complete figure source;
- one Left from the attribute block exits it;
- clicking elsewhere restores the rendered figure;
- the caption remains visible when the image fails to load.

- [ ] **Step 2: Implement the figure component**

Use the existing image render context for URL candidates. Render the generated
number as chrome, not selectable document text. Render alt text in the caption.
Only the ID reaches the element.

- [ ] **Step 3: Add source mode**

Register `figure` as a source-showing node. Its shown source is the full
`![alt](destination){attributes}` text so its image and attributes remain one
editable unit. Use source offsets tagged on the span.

- [ ] **Step 4: Re-render refs on numbering changes**

Include a reference-index version in the parse/render key for blocks containing
automatic references or figures. Inserting a figure above must update later
figure and reference text without editing those blocks.

- [ ] **Step 5: Run targeted probes**

```bash
npm run probe -- --with-workspace --fixture default-document.md test/probes/figure-rendering.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/auto-references.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/image-path-with-spaces.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/insert-image.js
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/markdown/nodes/figure.ts src/ui/markdown/create_node.ts \
  src/ui/markdown/registry.ts src/ui/markdown/render_context.ts \
  src/ui/markdown/markdown_editor.ts src/ui/markdown/editing/context.ts \
  src/ui/markdown/caret/offsets.ts src/styles.css \
  test/probes/figure-rendering.js
git commit -m "feat(editor): render numbered figures"
```

---

### Task 5: Export figures and automatic references

**Files:**
- Modify: `src/ui/export/preprocess.ts`
- Modify: `test/checks/check-export.mjs`
- Modify: `test/probes/export-markdown.js`
- Modify: `test/probes/export-latex.js`
- Modify: `test/probes/export-html.js`
- Modify: `test/probes/export-docx.js`
- Modify: `test/probes/export-odt.js`
- Modify: `test/probes/export-epub.js`

**Interfaces:**

- `ExportAnswers.figure`: the current figure kind for this run, including the
  resolved HTML form for processed Markdown.
- Auto refs are rewritten before Pandoc sees the source.

- [ ] **Step 1: Add failing export checks**

For input:

```markdown
See [#fig:model].

![Model overview](model.png){#fig:model .wide data-owner=demo}
```

Expect processed Markdown to contain:

```markdown
See [Figure 1](#fig:model).

<figure id="fig:model" class="wide" data-owner="demo">
  <img src="…" alt="Model overview">
  <figcaption>Figure 1. Model overview</figcaption>
</figure>
```

Expect Pandoc-target exports to wrap the native figure and avoid a duplicate ID.

- [ ] **Step 2: Implement the processed-Markdown HTML renderer**

Use the resolved image path, HTML escaping, `data-*` mapping, and the shared
number. This output is presentation-oriented and not re-imported as a Yi figure.

- [ ] **Step 3: Implement Pandoc target normalization**

For non-Markdown kinds, remove the native image ID and wrap the figure in an
ID-bearing `Div`. Prefix the alt/caption with `Figure N.` except for LaTeX/PDF.
Generated LaTeX keeps the native figure counter and emits `\hyperref` through
the already rewritten ordinary link.

- [ ] **Step 4: Run checks and export probes**

```bash
node test/checks/check-export.mjs
npx tsc --noEmit
npm run check
npm run probe -- --with-workspace --fixture default-document.md test/probes/export-markdown.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/export-latex.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/export-html.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/export-docx.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/export-odt.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/export-epub.js
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/export/preprocess.ts test/checks/check-export.mjs \
  test/probes/export-markdown.js test/probes/export-latex.js \
  test/probes/export-html.js test/probes/export-docx.js \
  test/probes/export-odt.js test/probes/export-epub.js
git commit -m "feat(export): render figure references"
```

---

### Task 6: Fixture, user documentation, and final verification

**Files:**
- Modify: `test/fixtures/workspace/default-document.md`
- Modify: `src/ui/documentation/documentation.en.md`
- Modify: `test/README.md`
- Modify: `docs/ai-context.md`
- Modify: `docs/architecture.md`
- Create: `test/probes/figure-crossrefs-default-document.js`

- [ ] **Step 1: Add the fixture examples**

Include:

- an unlabeled captioned figure that consumes Figure 1;
- a labeled figure with class and key/value attributes;
- an inline image that consumes no number;
- manual and automatic links to the labeled figure.

- [ ] **Step 2: Document the feature**

Explain implicit-figure recognition, explicit IDs, caption/number behavior,
`[text](#id)` versus `[#id]`, navigation, and processed/rendered export behavior.

- [ ] **Step 3: Run final checks and the full probe suite**

```bash
npx tsc --noEmit
cargo test
npm run check
npm run probe:all
```

- [ ] **Step 4: Commit**

```bash
git add test/fixtures/workspace/default-document.md \
  src/ui/documentation/documentation.en.md test/README.md \
  docs/ai-context.md docs/architecture.md \
  test/probes/figure-crossrefs-default-document.js
git commit -m "docs(markdown): show figure cross-references"
```
