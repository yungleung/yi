# Equation Cross-References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one targetable equation per labeled display-math block, suppress all native environment numbering, and make editor and export numbering consistent.

**Architecture:** A pure equation syntax module recognizes `[$$…$$]{…}` blocks and classifies their one top-level KaTeX environment. The block model and AST expose a labeled `equation` block while plain `$$…$$` stays ordinary math. A single lowering module produces unnumbered editor bodies and writer-specific export forms.

**Tech Stack:** TypeScript, unified/remark/mdast, KaTeX, Tauri, Pandoc, XeLaTeX, Node checks, Tauri MCP probes.

**Spec:** `docs/superpowers/specs/2026-10-26-equation-cross-references-design.md`

## Global Constraints

- The raw Markdown text is the only source of truth.
- Rendering and export never rewrite the stored note.
- One labeled display-math block is exactly one target and one Yi number.
- Per-row and nested-list equation references are out of scope.
- `$${#id}` is not supported; the ID belongs to `[$$…$$]{#id}`.
- Automatic references are `[#eq:id]`; manual links are `[text](#eq:id)`.
- Native environment numbers are suppressed in editor and every export.
- The outer `equation` is the only numbered LaTeX layer.
- Inner lowering is `aligned`, `gathered`, `alignedat`, or `split`.
- HTML uses KaTeX and must not show `.eqn-num` tags.
- EPUB, DOCX, ODT, Processed Markdown, and LaTeX/PDF use the same numbering policy.
- The complete environment × ID matrix belongs in checks, Documentation, and the default fixture.
- Do not merge this branch without an explicit request.

---

### Task 1: Parse Equation Blocks and Environments

**Files:**
- Create: `src/ui/markdown/syntax/equation_blocks.ts`
- Create: `test/checks/check-equation-blocks.mjs`
- Modify: `test/run-checks.mjs` only if checks are not discovered automatically

**Interfaces:**
- Consumes: `attributeBlockAtEnd`, `trimSpacesBack`
- Produces:

```ts
type EquationEnvironmentName =
  | 'equation' | 'align' | 'gather' | 'alignat'
  | 'aligned' | 'gathered' | 'alignedat' | 'split';

interface EquationBody {
  environment: EquationEnvironmentName | null;
  starred: boolean;
  argument: string | null;
  inner: string;
  source: string;
}

interface EquationBlockSource {
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  attribute: PandocAttributeBlock | null;
  math: string;
  body: EquationBody;
  source: string;
  from: number;
  to: number;
}

function readEquationBlock(source: string, from?: number): EquationBlockSource | null;
function isEquationOpening(line: string): boolean;
function equationClosing(line: string): boolean;
function unnumberedEquationBody(body: EquationBody): string;
function innerEquationBody(body: EquationBody): string;
function latexEquationBody(body: EquationBody, id: string): string;
```

- [ ] **Step 1: Write the failing syntax check**

Create `test/checks/check-equation-blocks.mjs` with literal expectations for:

```js
const source = '[$$\nx=1\n$$]{#eq:x .wide owner=demo}';
const block = readEquationBlock(source);
check('id', block.id, 'eq:x');
check('classes', block.classes, ['wide']);
check('attributes', block.attributes, { owner: 'demo' });
check('math', block.math, 'x=1');
check('not $$attr', readEquationBlock('$${#eq:x}\nx=1\n$$'), null);

const align = readEquationBlock('[$$\n\\begin{align}\nx&=1\\\\\ny&=2\n\\end{align}\n$$]{}');
check('environment', align.body.environment, 'align');
check(
  'unnumbered',
  unnumberedEquationBody(align.body),
  '\\begin{align*}\nx&=1\\\\\ny&=2\n\\end{align*}'
);
check(
  'inner',
  innerEquationBody(align.body),
  '\\begin{aligned}\nx&=1\\\\\ny&=2\n\\end{aligned}'
);
check(
  'latex',
  latexEquationBody(align.body, 'eq:system'),
  '\\begin{equation}\n\\begin{aligned}\nx&=1\\\\\ny&=2\n\\end{aligned}\n\\label{eq:system}\n\\end{equation}'
);
```

Add the complete matrix from the spec with `equation`, `equation*`, `align`,
`align*`, `aligned`, `gather`, `gather*`, `gathered`, `alignat`,
`alignat*`, `alignedat`, `split`, and a plain body.

- [ ] **Step 2: Run and verify RED**

Run: `node test/checks/check-equation-blocks.mjs`

Expected: module-not-found failure.

- [ ] **Step 3: Implement the pure parser and lowering**

`readEquationBlock` requires:

- `source.trimStart().startsWith('[$$')`;
- a final `$$]` followed immediately by `{}` or a Pandoc attribute block;
- no text after the attributes;
- an empty `{}` treated as no attributes;
- a non-empty block only when `id` exists and the body is non-empty.

`readEquationBody` recognizes one balanced top-level environment and preserves
its exact inner source.

Lowering rules:

- unnumbered top-level `equation|align|gather|alignat` add `*`;
- `innerEquationBody` maps `equation*` to its body, `align*` to `aligned`,
  `gather*` to `gathered`, and `alignat*` to `alignedat`;
- a plain body stays plain for inner rendering;
- `latexEquationBody` wraps plain or `equation` content directly and the
  multi-row forms in their inner environment;
- `alignat` keeps its mandatory `{n}` argument.

- [ ] **Step 4: Verify GREEN**

Run: `node test/checks/check-equation-blocks.mjs`

Expected: `equation blocks: all checks passed`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/markdown/syntax/equation_blocks.ts test/checks/check-equation-blocks.mjs
git commit -m "feat(markdown): parse labeled equations"
```

---

### Task 2: Add `[$$` Autocomplete

**Files:**
- Modify: `src/ui/markdown/editing/fence_open.ts`
- Modify: `test/checks/check-fence-open.mjs`
- Modify: `test/probes/fence-open-typing.js`

**Interfaces:**
- Consumes: `equationOpeningWrite` from `syntax/equation_blocks.ts`
- Produces: a blocked edit replacing a lone `[$$]` line with `[$$\n\n$$]{}`

- [ ] **Step 1: Add failing pure cases**

In `check-fence-open.mjs`, assert:

```js
check(
  '[$$ opens labeled math',
  fenceOpenWrite('\nhello', 1, '[$$'),
  {
    kind: 'equation',
    from: 0,
    to: 0,
    replacement: '[$$\n\n$$]{}',
    caret: 5
  }
);
check('prose before [$$ stays prose', fenceOpenWrite('say [$$', 7, ''), null);
```

The actual offsets must be derived using the existing line-padding behavior.

- [ ] **Step 2: Verify RED**

Run: `node test/checks/check-fence-open.mjs`

Expected: `[$$` still opens an ordinary display formula or remains text.

- [ ] **Step 3: Implement the edit**

Extend `FenceOpenKind` with `equation`. When a completed delimiter line is
exactly `[$$`, replace it with the padded block:

```text
[$$

$$]{}
```

Place the caret on the blank body line. Reuse `blockPadding`. Do not open in
prose or inside a literal region.

- [ ] **Step 4: Add the app probe**

In `fence-open-typing.js`, type `[`, `$`, `$` on the prepared empty first line.
Assert:

- raw text is `[$$\n\n$$]{}\n\nhello world\n`;
- the block kind is `equation`;
- the caret is on the body line;
- typing `Q` writes `[$$\nQ\n$$]{}\n\nhello world\n`;
- plain `[` followed by text still uses ordinary bracket pairing.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node test/checks/check-fence-open.mjs
npm run probe -- test/probes/fence-open-typing.js
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/markdown/editing/fence_open.ts src/ui/markdown/syntax/equation_blocks.ts test/checks/check-fence-open.mjs test/probes/fence-open-typing.js
git commit -m "feat(editor): autocomplete labeled equations"
```

---

### Task 3: Group, Parse, and Render Labeled Equations

**Files:**
- Modify: `src/ui/markdown/document/block_kinds.ts`
- Modify: `src/ui/markdown/document/blocks.ts`
- Modify: `src/ui/markdown/syntax/parser.ts`
- Modify: `src/ui/markdown/ast.ts`
- Modify: `src/ui/markdown/mdast.d.ts`
- Modify: `src/ui/markdown/create_block.ts`
- Create: `src/ui/markdown/nodes/equation.ts`
- Modify: `src/ui/markdown/create_node.ts`
- Modify: `src/ui/markdown/caret/offsets.ts`
- Modify: `src/styles.css`
- Create: `test/checks/check-equation-parser.mjs`
- Create: `test/probes/equation-rendering.js`

**Interfaces:**
- Consumes: `readEquationBlock`, `innerEquationBody`, `unnumberedEquationBody`, render context `equationLabelAt(from)`
- Produces:

```ts
interface EquationNode {
  type: 'equation';
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  attribute: PandocAttributeBlock | null;
  math: string;
  body: EquationBody;
  source: string;
  position: { start: { offset: number }; end: { offset: number } };
}

class Equation extends RevealableNodeComponent {}
```

- [ ] **Step 1: Write failing parser checks**

Assert:

- `[$$\nx\n$$]{}` parses as one equation node;
- `[$$\nx\n$$]{#eq:x}` carries its ID;
- exact serialization preserves wrapper and attrs;
- `$${#eq:x}\nx\n$$` remains ordinary display math;
- malformed wrappers remain paragraphs;
- an equation block is one `MarkdownBlock`.

- [ ] **Step 2: Verify RED**

Run:

```bash
node test/checks/check-equation-parser.mjs
node test/checks/check-blocks.mjs
```

- [ ] **Step 3: Add the block kind and parser repair**

Add `equation` to `BlockKind`. Add it to `isRawRendered`, `hasSourceMode`, and
`isFenced`. In `blocksFrom`, detect `[$$` and consume through `$$]…}` before
ordinary display-math detection.

Add `restoreEquations(root, markdown)` after table restoration. It replaces the
paragraph/node range covering a valid wrapper with one `EquationNode`.

Register a stringifier rule that emits `node.source + '\n'`.

- [ ] **Step 4: Write the failing render probe**

`equation-rendering.js` loads:

```md
See [#eq:plain] and [#eq:align].

[$$
E=mc^2
$$]{#eq:plain}

[$$
\begin{align}
x&=1\\
y&=2
\end{align}
$$]{#eq:align .wide}
```

Assert:

- both blocks carry their IDs;
- labels read `Equation (1)` and `Equation (2)`;
- `.katex .eqn-num` contributes no visible number;
- classes are absent from the DOM;
- clicking a formula reveals the complete wrapper;
- typing edits the formula source;
- leaving restores rendering.

- [ ] **Step 5: Implement rendering**

`Equation` renders `innerEquationBody` through KaTeX. Append a
`data-chrome` label from `equationLabelAt`. It reveals the whole block source
while the caret is in it.

For ordinary display math, call `unnumberedEquationBody` before KaTeX when a
top-level environment is recognized, so auto tags do not appear.

Keep source mode exact: `[$$`, body, `$$]`, and attributes map to document
offsets.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
node test/checks/check-equation-parser.mjs
node test/checks/check-blocks.mjs
npm run probe -- test/probes/equation-rendering.js
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/markdown/document/block_kinds.ts src/ui/markdown/document/blocks.ts src/ui/markdown/syntax/parser.ts src/ui/markdown/ast.ts src/ui/markdown/mdast.d.ts src/ui/markdown/create_block.ts src/ui/markdown/nodes/equation.ts src/ui/markdown/create_node.ts src/ui/markdown/caret/offsets.ts src/styles.css test/checks/check-equation-parser.mjs test/checks/check-blocks.mjs test/probes/equation-rendering.js
git commit -m "feat(editor): render labeled equations"
```

---

### Task 4: Index Labels and References

**Files:**
- Modify: `src/ui/markdown/document/reference_index.ts`
- Modify: `src/ui/markdown/render_context.ts`
- Modify: `src/ui/markdown/markdown_editor.ts`
- Modify: `test/checks/check-reference-index.mjs`
- Create: `test/probes/equation-crossrefs.js`

**Interfaces:**
- Consumes: `EquationNode`
- Produces: equation entries with one-based `number`, explicit ID, empty title, and caret at body start; `RenderContext.equationLabelAt(sourceFrom)`

- [ ] **Step 1: Write failing index checks**

Assert:

- two labeled equations number `(1)` and `(2)`;
- unlabeled equations do not enter the index;
- equation entries carry configured labels and prefixes;
- duplicate IDs follow first-match.

- [ ] **Step 2: Verify RED**

Run: `node test/checks/check-reference-index.mjs`

- [ ] **Step 3: Implement indexing**

Add `equation` traversal to `referenceIndex`.

Use:

```ts
caretAt = node.position.start.offset + node.mathFrom;
```

Only create an entry when `node.id !== null`.

Expose `equationLabelAt` through render context.

- [ ] **Step 4: Write and pass the navigation probe**

Assert:

- `[#eq:align]` displays the configured label;
- command-click reveals the distant block;
- the caret lands at the first formula character;
- the hash is unchanged;
- manual link text is not replaced.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node test/checks/check-reference-index.mjs
npm run probe -- test/probes/equation-crossrefs.js
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/markdown/document/reference_index.ts src/ui/markdown/render_context.ts src/ui/markdown/markdown_editor.ts test/checks/check-reference-index.mjs test/probes/equation-crossrefs.js
git commit -m "feat(crossrefs): index labeled equations"
```

---

### Task 5: Lower Equations for Portable Exports

**Files:**
- Create: `src/ui/export/equation_rewrites.ts`
- Create: `src/ui/export/equation_html.ts`
- Modify: `src/ui/export/preprocess.ts`
- Modify: `test/checks/check-export.mjs`
- Modify: `test/probes/export-html.js`
- Modify: `test/probes/export-epub.js`
- Modify: `test/probes/export-docx.js`
- Modify: `test/probes/export-odt.js`
- Modify: `test/probes/export-markdown.js`

**Interfaces:**
- Consumes: equation spans and entries, `unnumberedEquationBody`, `innerEquationBody`
- Produces: writer-specific equation rewrites and Processed Markdown MathML

- [ ] **Step 1: Add failing pure checks**

Cover both no-ID and ID forms for every matrix row. Assert:

- no-ID HTML uses starred top-level environments;
- ID HTML uses one wrapper, one visible label, and an unnumbered inner body;
- plain unlabeled math remains plain;
- Processed Markdown contains `id="eq:x"`, MathML, and one equation label;
- ordinary math without an environment is unchanged.

- [ ] **Step 2: Verify RED**

Run: `node test/checks/check-export.mjs`

- [ ] **Step 3: Implement export rewrites**

For Pandoc-backed writers:

- no-ID: replace the math body with `unnumberedEquationBody`;
- ID: replace the complete equation block with an ID-bearing wrapper containing
  `innerEquationBody` and one label;
- DOCX and ODT use the same `Div` wrapper;
- HTML and EPUB preserve native math and visible number.

For Processed Markdown:

- generate KaTeX MathML in `equation_html.ts`;
- emit an ID-bearing `<div class="equation-target">`;
- append one escaped equation label;
- preserve the original TeX in a `<annotation>` or escaped data attribute.

Do not rewrite explicit `\tag`.

- [ ] **Step 4: Extend the real export probes**

Each probe loads a labeled `align` block and a labeled plain block. Assert the
target, the visible label, and absence of native row numbers.

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

- [ ] **Step 6: Commit**

```bash
git add src/ui/export/equation_rewrites.ts src/ui/export/equation_html.ts src/ui/export/preprocess.ts test/checks/check-export.mjs test/probes/export-html.js test/probes/export-epub.js test/probes/export-docx.js test/probes/export-odt.js test/probes/export-markdown.js
git commit -m "feat(export): render equation references"
```

---

### Task 6: Native LaTeX and PDF Equations

**Files:**
- Modify: `src/ui/export/reference_header.ts`
- Modify: `src/ui/export/preprocess.ts`
- Modify: `src/ui/export/equation_rewrites.ts`
- Modify: `test/checks/check-reference-header.mjs`
- Modify: `test/checks/check-export.mjs`
- Modify: `test/probes/export-latex.js`
- Modify: `test/probes/export-pdf.js`
- Create: `test/probes/export-pdf-equation-template.js`

**Interfaces:**
- Produces `\yiEquationRef{id}` and one outer `equation` for every labeled block

- [ ] **Step 1: Write failing checks**

Assert the reference header defines:

```latex
\providecommand{\yiEquationRef}[1]{%
  \hyperref[#1]{\equationname~\eqref{#1}}%
}
```

Assert `[#eq:x]` becomes `\yiEquationRef{eq:x}` for LaTeX/PDF and ordinary
links for every other writer.

- [ ] **Step 2: Verify RED**

Run:

```bash
node test/checks/check-reference-header.mjs
node test/checks/check-export.mjs
```

- [ ] **Step 3: Implement lowering**

For LaTeX/PDF:

- unlabeled environment blocks receive `unnumberedEquationBody`;
- labeled blocks receive `latexEquationBody`;
- the generated header includes only `\yiEquationRef`, not a separate equation
  counter;
- template `\theequation` remains authoritative;
- manual links remain `\hyperref`.

- [ ] **Step 4: Extend LaTeX/PDF probes**

LaTeX assertions:

- one outer `equation` per labeled block;
- no unstarred inner display environment;
- one `\label`;
- automatic reference uses `\yiEquationRef`.

PDF assertions:

- `Equation 2-1` follows configured prefix;
- `align` rows do not produce multiple numbers;
- a copied package redefining `\theequation` gives `Equation R-1`.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node test/checks/check-reference-header.mjs
node test/checks/check-export.mjs
npm run probe -- test/probes/export-latex.js
npm run probe -- test/probes/export-pdf.js
npm run probe -- test/probes/export-pdf-equation-template.js
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/export/reference_header.ts src/ui/export/preprocess.ts src/ui/export/equation_rewrites.ts test/checks/check-reference-header.mjs test/checks/check-export.mjs test/probes/export-latex.js test/probes/export-pdf.js test/probes/export-pdf-equation-template.js
git commit -m "feat(export): resolve equation references in latex"
```

---

### Task 7: Document and Demonstrate the Full Matrix

**Files:**
- Modify: `src/ui/documentation/documentation.en.md`
- Modify: `test/fixtures/workspace/default-document.md`
- Create: `test/probes/equation-matrix-default-document.js`
- Modify: `test/README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/ai-context.md`
- Modify: `docs/superpowers/plans/2026-10-26-equation-cross-references.md`

**Interfaces:**
- Consumes all previous tasks
- Produces user documentation, fixture matrix, and final verification

- [ ] **Step 1: Expand the fixture**

Set:

```yaml
reference-labels:
  equation: Formula
reference-number-prefixes:
  equation: "2-"
```

Add all matrix rows in a dedicated Equations section. Use separate paragraphs and
live targets for the labeled forms. Include automatic and manual references.

- [ ] **Step 2: Write the failing matrix probe**

Assert:

- every matrix row renders without native row tags;
- labeled rows show `Formula (2-N)`;
- unlabeled rows have no Yi label;
- labels renumber after insertion;
- automatic references update;
- command-click reaches formula start;
- attributes remain source-only.

- [ ] **Step 3: Run RED**

Run:

```bash
npm run probe -- --fixture default-document.md test/probes/equation-matrix-default-document.js
```

- [ ] **Step 4: Document every case**

Explain:

- `$$…$$` versus `[$$…$$]{…}`;
- autocomplete;
- the full environment × ID matrix;
- environment suppression;
- one target per block;
- automatic versus manual references;
- labels and prefixes;
- every export;
- HTML/KaTeX suppression;
- `\tag` limitation;
- template `\theequation`.

- [ ] **Step 5: Update architecture and test indexes**

Record the equation syntax, block kind, index, renderer, lowering module, and
`\yiEquationRef` contract.

- [ ] **Step 6: Full verification**

Run:

```bash
npx tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml
npm run check
npm run probe -- --fixture default-document.md test/probes/equation-matrix-default-document.js
npm run probe -- test/probes/equation-rendering.js
npm run probe -- test/probes/equation-crossrefs.js
npm run probe:all
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/documentation/documentation.en.md test/fixtures/workspace/default-document.md test/probes/equation-matrix-default-document.js test/README.md docs/architecture.md docs/ai-context.md docs/superpowers/plans/2026-10-26-equation-cross-references.md
git commit -m "docs(equations): document equation cross-references"
```

---

## Final Review Checklist

- [ ] Plain and labeled display math parse as separate kinds.
- [ ] `[$$` writes a complete labeled-math skeleton.
- [ ] Every environment × ID matrix row is checked.
- [ ] Native environment numbers never appear in editor or exports.
- [ ] Labeled multi-row environments have exactly one number.
- [ ] Only labeled equations enter the reference index.
- [ ] Automatic references use consistent Yi text.
- [ ] Manual links preserve author text.
- [ ] HTML/KaTeX is covered explicitly.
- [ ] DOCX/ODT target wrappers and labels are present.
- [ ] Processed Markdown contains MathML and an ID.
- [ ] LaTeX/PDF use one outer equation and `\yiEquationRef`.
- [ ] Template `\theequation` remains authoritative.
- [ ] Documentation, fixture, checks, probes, and indexes cover every case.
