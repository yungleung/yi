# Code Block Cross-References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add document-configured figure/listing labels and literal number prefixes, then implement targetable fenced code listings across editing and every export kind.

**Architecture:** A pure reference-vocabulary module reads `reference-labels` and `reference-number-prefixes` from YAML frontmatter. A pure code-fence parser turns qualifying fences into `listing` AST nodes and shared target entries; the existing block renderer draws generated labels and captions while retaining complete source mode. Export preprocessing emits Pandoc Divs for HTML/EPUB/DOCX/ODT, HTML figures for processed Markdown, and shape-specific LaTeX rewrites plus a generated LaTeX counter header.

**Tech Stack:** TypeScript, mdast/unified/remark, yaml, Rust/Tauri, Pandoc, Node check scripts, Tauri MCP probes.

**Specs:**
- `docs/superpowers/specs/2026-10-24-cross-reference-targets-design.md`
- `docs/superpowers/specs/2026-10-24-figure-cross-references-design.md`
- `docs/superpowers/specs/2026-10-25-code-block-cross-references-design.md`

## Global Constraints

- Never merge into `main` without a new explicit request.
- Use `codex/code-block-cross-references`.
- Reference labels and prefixes are document metadata; Yi interface language must not affect them.
- Missing labels fall back per kind to `Figure`, `Listing`, `Table`, `Equation`, or `List`.
- Missing prefixes fall back per kind to the empty string.
- Prefixes are literal; never infer chapters, sections, or headings.
- Every behavior change starts with a failing test.
- Run `npx tsc --noEmit`, `cargo test`, `npm run check`, and affected Tauri MCP probes before handoff.
- Keep syntax modules free of DOM and app-service imports.

---

### Task 1: Shared reference vocabulary

**Files:**
- Create: `src/ui/markdown/syntax/reference_vocabulary.ts`
- Create: `test/checks/check-reference-vocabulary.mjs`
- Modify: `src/ui/markdown/document/reference_index.ts`
- Modify: `src/ui/markdown/markdown_editor.ts`
- Modify: `src/ui/export/preprocess.ts`
- Modify: `src/ui/export/export_flow.ts`
- Modify: `locales/*.json`

**Interfaces:**
- Consumes: the first mdast `yaml` child from `parseMarkdown`.
- Produces:

```ts
export type NumberedReferenceKind = 'figure' | 'listing' | 'table' | 'equation' | 'list';

export interface ReferenceStyle {
  label: string;
  prefix: string;
}

export type ReferenceVocabulary = Record<NumberedReferenceKind, ReferenceStyle>;

export const DEFAULT_REFERENCE_VOCABULARY: Readonly<ReferenceVocabulary>;

export function referenceVocabularyFromTree(tree: Root): ReferenceVocabulary;
export function referenceVocabularyFromFrontmatter(
  frontmatter: string | null
): ReferenceVocabulary;
export function referenceNumberText(
  kind: NumberedReferenceKind,
  number: number,
  vocabulary: ReferenceVocabulary
): string;
```

- `ReferenceEntry` gains `caretAt: number`, `label: string`, and `numberPrefix: string`.

- [ ] **Step 1: Write failing vocabulary checks**

Create `test/checks/check-reference-vocabulary.mjs` using the same `bundleModule` and `check` helpers as `check-reference-index.mjs`. Assert:

```js
const {
  DEFAULT_REFERENCE_VOCABULARY,
  referenceNumberText,
  referenceVocabularyFromFrontmatter
} = await bundleModule('src/ui/markdown/syntax/reference_vocabulary.ts', 'reference_vocabulary');

check('missing metadata uses English figure label and no prefix',
  referenceVocabularyFromFrontmatter(null).figure, {
  label: 'Figure',
  prefix: ''
});

const configured = referenceVocabularyFromFrontmatter(`
reference-labels:
  figure: Diagram
reference-number-prefixes:
  figure: A-
`);
check('configured labels and prefixes compose',
  referenceNumberText('figure', 1, configured), 'Diagram A-1');
check('equation keeps its parentheses',
  referenceNumberText('equation', 3, {
    ...DEFAULT_REFERENCE_VOCABULARY,
    equation: { label: 'Equation', prefix: '2-' }
  }), 'Equation (2-3)');
check('an invalid value falls back alone',
  referenceNumberText('listing', 4, referenceVocabularyFromFrontmatter(`
reference-labels:
  listing: 42
  figure: Diagram
reference-number-prefixes:
  listing: 9
  figure: A-
`)), 'Listing 4');
```

Also cover non-scalar values, malformed YAML, whitespace-only labels, unknown keys, and a non-empty prefix preserving non-surrounding whitespace.

- [ ] **Step 2: Run the check and watch it fail**

Run: `node test/checks/check-reference-vocabulary.mjs`

Expected: module-not-found failure for `reference_vocabulary.ts`.

- [ ] **Step 3: Implement the pure vocabulary module**

Use `parseDocument(frontmatter, { schema: 'failsafe' })`. Parse the first mdast child whose `type === 'yaml'`. Require each mapping to be a record and each value to be a string. Trim labels; accept a prefix only when non-empty after trimming, preserving the original non-empty value.

- [ ] **Step 4: Move figure label consumers to the vocabulary**

In `reference_index.ts`, build the vocabulary once from the parsed tree and assign each numbered entry its `label` and `numberPrefix`. Make `referenceLabel(entry)` use `referenceNumberText` and remove the translation callback. Use `entry.caretAt` in `jumpToReference`.

In `markdown_editor.ts`, set:

```ts
referenceText: (id) => {
  const target = firstReference(this.state.referenceEntries(), id);
  return target
    ? { text: referenceLabel(target), resolved: true }
    : { text: `#${id}`, resolved: false };
},
figureLabelAt: (from) => {
  const target = this.state.referenceEntries().find(
    (entry) => entry.kind === 'figure' && entry.from === from
  );
  return target ? referenceLabel(target) : null;
}
```

Remove `translate` from `ExportAnswers` and all figure/automatic-reference calls to `t()` in `preprocess.ts` and `export_flow.ts`. Remove `reference.figure` from every locale catalogue; the locale checker must remain green with no unused keys.

- [ ] **Step 5: Run the focused checks**

Run:

```bash
node test/checks/check-reference-vocabulary.mjs
node test/checks/check-reference-index.mjs
node test/checks/check-auto-references.mjs
node test/checks/check-locales.mjs
npx tsc --noEmit
```

Expected: all pass, and no source still calls `t('reference.figure')`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/markdown/syntax/reference_vocabulary.ts test/checks/check-reference-vocabulary.mjs \
  src/ui/markdown/document/reference_index.ts src/ui/markdown/markdown_editor.ts \
  src/ui/export/preprocess.ts src/ui/export/export_flow.ts locales
git commit -m "feat(crossrefs): configure document labels and prefixes"
```

---

### Task 2: Parse code-fence attributes and index listings

**Files:**
- Create: `src/ui/markdown/syntax/code_fences.ts`
- Create: `src/ui/markdown/syntax/listings.ts`
- Create: `test/checks/check-code-fences.mjs`
- Modify: `src/ui/markdown/syntax/parser.ts`
- Modify: `src/ui/markdown/mdast.d.ts`
- Modify: `src/ui/markdown/ast.ts`
- Modify: `src/ui/markdown/document/reference_index.ts`
- Modify: `test/checks/check-reference-index.mjs`
- Modify: `test/checks/check-figures.mjs`

**Interfaces:**
- Produces:

```ts
export interface CodeFenceData {
  id: string | null;
  language: string | null;
  classes: string[];
  attributes: Record<string, string>;
  caption: string | null;
  attribute: PandocAttributeBlock | null;
  bodyStart: number;
}

export function codeFenceData(text: string): CodeFenceData;
export function listingFenceData(text: string): CodeFenceData | null;
export function withoutListingMetadata(data: CodeFenceData): string;
```

- `ListingNode extends Code` adds the parsed data, original `source`, and position.

- [ ] **Step 1: Write failing code-fence checks**

Cover:

```js
check('language before attributes', listing('```python {#lst:one caption="Example"}'), {
  id: 'lst:one',
  language: 'python',
  caption: 'Example'
});
check('language in attributes', listing('```{#lst:one .python .numberLines startFrom=5}'), {
  id: 'lst:one',
  language: 'python',
  classes: ['python', 'numberLines'],
  attributes: { startFrom: '5' }
});
check('caption only has no target', listing('```python {caption="Example"}').id, null);
check('malformed attrs are not a listing', listing('```python {#lst:one caption="broken}'), null);
check('closing fence attrs are ignored', listing('```python\nx\n``` {#lst:bogus}'), null);
```

Also cover `caption=""`, braces inside quoted caption text, an unclosed fence, and preservation of the body start.

- [ ] **Step 2: Run and watch the checks fail**

Run: `node test/checks/check-code-fences.mjs`

Expected: module-not-found failure.

- [ ] **Step 3: Implement code-fence parsing**

Use `openingFence`, `fenceBody`, and `attributeBlockAtEnd`. Accept exactly:

```markdown
```python {#id .class key=value caption="..."}
```{#id .python .class key=value caption="..."}
```

Reject extra unquoted text around the attribute block. Treat empty/whitespace captions as null.

- [ ] **Step 4: Transform qualifying mdast code nodes**

In `listings.ts`, walk root-level children and replace a `code` node with `listing` when `listingFenceData(source)` has an ID or caption. Preserve `source`, `position`, and code value. Call `restoreListings(root, markdown)` after `restoreFigures`. Add the `listing` serializer that emits `node.source`.

- [ ] **Step 5: Index only ID-bearing listings**

In `reference_index.ts`, add listing handling. Assign `kind: 'listing'`, increment only for a non-null ID, set `title` to the caption or empty string, set `caretAt` to the first body-line character, and use the frontmatter label/prefix.

Update `check-reference-index.mjs` with a caption-only block followed by two ID listings, proving the caption-only block does not consume a number and `Figure 2-1`/`Listing A.1` composition matches the shared vocabulary.

- [ ] **Step 6: Run checks**

Run:

```bash
node test/checks/check-code-fences.mjs
node test/checks/check-reference-index.mjs
node test/checks/check-figures.mjs
node test/checks/check-reference-vocabulary.mjs
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/markdown/syntax/code_fences.ts src/ui/markdown/syntax/listings.ts \
  src/ui/markdown/syntax/parser.ts src/ui/markdown/mdast.d.ts src/ui/markdown/ast.ts \
  src/ui/markdown/document/reference_index.ts test/checks/check-code-fences.mjs \
  test/checks/check-reference-index.mjs test/checks/check-figures.mjs
git commit -m "feat(markdown): parse listing targets"
```

---

### Task 3: Render listings and support source navigation

**Files:**
- Modify: `src/ui/markdown/create_block.ts`
- Modify: `src/ui/markdown/document/state.ts`
- Modify: `src/ui/markdown/render_context.ts`
- Modify: `src/ui/markdown/markdown_editor.ts`
- Modify: `src/ui/markdown/editing/references.ts`
- Modify: `src/styles.css`
- Create: `test/probes/listing-rendering.js`
- Create: `test/probes/listing-crossrefs.js`

**Interfaces:**
- `RenderContext` adds `listingLabelAt(from: number): string | null`.
- `ReferenceEntry.caretAt` is the first body character.

- [ ] **Step 1: Write failing Tauri probes**

`listing-rendering.js` loads:

```markdown
```python {caption="Unnumbered caption"}
print(0)
```

```python {#lst:one}
print(1)
```

```python {#lst:two caption="Second caption" .numberLines startFrom=7}
print(2)
```
```

Assert caption-only is unnumbered; ID-only is `Listing 1.`; the second is `Listing 2. Second caption`; the source fence is hidden outside; all three blocks remain ordinary code in their bodies.

`listing-crossrefs.js` loads a long note and uses `[#lst:two]`. Assert command-click lands on `print(2)`, source mode is visible, and after inserting a listing above the reference text renumbers to `Listing 3`.

- [ ] **Step 2: Run the probes and watch them fail**

Run:

```bash
npm run probe -- --fixture default-document.md test/probes/listing-rendering.js
npm run probe -- --fixture default-document.md test/probes/listing-crossrefs.js
```

Expected: listing labels are absent.

- [ ] **Step 3: Implement the block rendering**

In `renderFenceBody`, when `listingFenceData(node.text)` returns a listing:

- add `markdown-listing-block` to the block container;
- set the container's `id` to the explicit ID;
- append a `figure.markdown-listing` containing the existing `FenceText` pre;
- append `figcaption.markdown-listing-caption` when a caption or ID exists;
- use `renderContext().listingLabelAt(node.charStart)` for the generated label;
- keep the language button.

Do not render the caption in source mode. Add focused CSS in `styles.css` for the block, caption, and label.

- [ ] **Step 4: Invalidate listing labels and route navigation**

In `MarkdownEditorState.parseKey`, include `referencesVersion` for a fenced code block with listing metadata. In `jumpToReference`, use `target.caretAt`; for a listing it is computed by `fenceBody(text).start`.

- [ ] **Step 5: Run probes and checks**

Run:

```bash
npm run probe -- --fixture default-document.md test/probes/listing-rendering.js
npm run probe -- --fixture default-document.md test/probes/listing-crossrefs.js
npm run probe -- --fixture default-document.md test/probes/auto-references.js
npm run check
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/markdown/create_block.ts src/ui/markdown/document/state.ts \
  src/ui/markdown/render_context.ts src/ui/markdown/markdown_editor.ts \
  src/ui/markdown/editing/references.ts src/styles.css \
  test/probes/listing-rendering.js test/probes/listing-crossrefs.js
git commit -m "feat(editor): render listing references"
```

---

### Task 4: Export non-LaTeX listings and processed Markdown

**Files:**
- Modify: `src/ui/export/preprocess.ts`
- Modify: `src/ui/export/node_spans.ts`
- Modify: `test/checks/check-export.mjs`
- Modify: `test/probes/export-html.js`
- Modify: `test/probes/export-epub.js`
- Modify: `test/probes/export-docx.js`
- Modify: `test/probes/export-odt.js`
- Modify: `test/probes/export-markdown.js`

**Interfaces:**
- Produces one `listingMarkdown(node, answers)` path for HTML/EPUB/DOCX/ODT.
- Produces one `listingHtml(node, label)` path for processed Markdown.

- [ ] **Step 1: Add failing export checks**

In `check-export.mjs`, assert:

- an ID listing becomes a `::: {#lst:one .listing}` Div;
- the ID and caption disappear from the inner code fence;
- `Listing 1. Caption` is a `.listing-caption` block;
- caption-only becomes an unnumbered caption;
- processed Markdown emits escaped `<figure id="lst:one" class="listing">`, `<pre><code>`, and `<figcaption>`;
- a non-empty `reference-labels.listing` and `reference-number-prefixes.listing` appear in the caption and automatic reference.

Run: `node test/checks/check-export.mjs`

Expected: listing assertions fail.

- [ ] **Step 2: Implement Pandoc-native wrappers**

Use a canonical safe backtick fence for the inner block. Preserve language, classes, `numberLines`, `startFrom`, and other non-ID/non-caption attributes. Move the ID to the outer Div. Escape Markdown punctuation in the caption paragraph.

- [ ] **Step 3: Implement processed Markdown HTML**

Escape code and caption text. Put the ID on `<figure>`, language on `<code>`, other classes on `<figure>`, and other attributes as escaped `data-*`. Default caption punctuation remains `Listing N.` or `Listing N. Caption`.

- [ ] **Step 4: Extend export probes**

Each Pandoc-backed probe asserts a visible numbered caption and working target. Processed Markdown asserts the HTML figure and resolved ordinary link. Use distinct IDs and captions per probe. No probe may rely on an image.

- [ ] **Step 5: Run focused checks and probes**

Run:

```bash
node test/checks/check-export.mjs
npm run probe -- --fixture default-document.md test/probes/export-html.js
npm run probe -- --fixture default-document.md test/probes/export-epub.js
npm run probe -- --fixture default-document.md test/probes/export-docx.js
npm run probe -- --fixture default-document.md test/probes/export-odt.js
npm run probe -- --fixture default-document.md test/probes/export-markdown.js
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/export/preprocess.ts src/ui/export/node_spans.ts \
  test/checks/check-export.mjs test/probes/export-html.js test/probes/export-epub.js \
  test/probes/export-docx.js test/probes/export-odt.js test/probes/export-markdown.js
git commit -m "feat(export): render portable listings"
```

---

### Task 5: LaTeX listing bridges and native counter prefixes

**Files:**
- Create: `src/ui/export/reference_header.ts`
- Create: `test/checks/check-reference-header.mjs`
- Create: `src-tauri/src/export/reference_prefixes.rs`
- Modify: `src-tauri/src/export/mod.rs`
- Modify: `src-tauri/src/export/run/mod.rs`
- Modify: `src-tauri/src/export/run/arguments.rs`
- Modify: `src-tauri/src/export/tests/run/arguments.rs`
- Modify: `src/api/export.ts`
- Modify: `src/ui/export/export_flow.ts`
- Modify: `src/ui/export/preprocess.ts`
- Modify: `test/probes/export-latex.js`
- Modify: `test/probes/export-pdf.js`
- Modify: `test/probes/export-pdf-font.js`

**Interfaces:**
- `referenceHeader(markdown: string): string | null` returns the `\AtBeginDocument` block.
- `ExportRequest.counter_header: string | null`.
- Rust `reference_prefixes::write_header(dir: &Path, source: &str) -> Result<PathBuf, String>`.

- [ ] **Step 1: Write failing header and LaTeX checks**

Assert:

```js
const { referenceHeader } = await bundleModule(
  'src/ui/export/reference_header.ts',
  'reference_header'
);
check('empty prefixes make no header',
  referenceHeader('---\ntitle: A\n---\n'), null);
const figureHeader = referenceHeader(`
---
reference-number-prefixes:
  figure: "2-"
---
`);
check('figure prefix changes the native counter',
  figureHeader?.includes('\\renewcommand{\\thefigure}{\\detokenize{2-}\\arabic{figure}}'),
  true);
```

Also cover table, equation, conditional listing, special characters, and frontmatter fallbacks.

Run: `node test/checks/check-reference-header.mjs`

Expected: module-not-found failure.

- [ ] **Step 2: Implement the header builder**

Generate `\AtBeginDocument` only when at least one prefix is non-empty. Escape literal prefix text for LaTeX safely. Emit the listing counter override only under `\ifdefined\thelstlisting`.

- [ ] **Step 3: Carry the header through Rust**

Add `counter_header: Option<String>` to the Rust and TypeScript request. Write it under the run's temporary directory and add a second `--include-in-header` argument. Keep the PDF font header independent and preserve argument order tests.

- [ ] **Step 4: Rewrite listing shapes for LaTeX/PDF**

In `preprocess.ts`:

- ID + caption: original fence unchanged;
- ID only: canonical fence with `caption="\u200B"`;
- caption only: canonical fence with `title="<caption>"` and no `caption`;
- ordinary: unchanged.

Do not inspect `syntax-highlighting`.

- [ ] **Step 5: Extend LaTeX/PDF probes**

Assert:

- mixed caption-only, ID-only, and ID+caption listings produce native order 1, 2, 3 under idiomatic highlighting;
- caption-only does not advance the counter;
- a `2-` prefix appears in the native visible caption and automatic link text;
- non-idiomatic output compiles and keeps resolvable targets;
- the existing font probes still pass.

Run:

```bash
node test/checks/check-reference-header.mjs
node test/checks/check-export.mjs
cargo test export::tests::run::arguments
npm run probe -- --fixture default-document.md test/probes/export-latex.js
npm run probe -- --fixture default-document.md test/probes/export-pdf.js
npm run probe -- --fixture default-document.md test/probes/export-pdf-font.js
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/export/reference_header.ts test/checks/check-reference-header.mjs \
  src-tauri/src/export/reference_prefixes.rs src-tauri/src/export/mod.rs \
  src-tauri/src/export/run/mod.rs src-tauri/src/export/run/arguments.rs \
  src-tauri/src/export/tests/run/arguments.rs src/api/export.ts \
  src/ui/export/export_flow.ts src/ui/export/preprocess.ts \
  test/probes/export-latex.js test/probes/export-pdf.js test/probes/export-pdf-font.js
git commit -m "feat(export): align listing numbering in latex"
```

---

### Task 6: Update user documentation and the default note

**Files:**
- Modify: `src/ui/documentation/documentation.en.md`
- Modify: `test/fixtures/workspace/default-document.md`
- Modify: `test/probes/default-document.js`
- Modify: `test/probes/figure-crossrefs-default-document.js`
- Create: `test/probes/listing-crossrefs-default-document.js`

**Interfaces:**
- The default note must demonstrate every source case and both frontmatter maps.
- Documentation must describe every case in the specification's documentation checklist.

- [ ] **Step 1: Update the default note**

Add:

```yaml
reference-labels:
  figure: Figure
  listing: Code excerpt
reference-number-prefixes:
  figure: "2-"
  listing: "2-"
```

Add one ordinary fence, one caption-only fence, one ID-only fence, one full listing with attributes, `.numberLines`, `startFrom`, manual and automatic links.

- [ ] **Step 2: Update the documentation**

Explain:

- both fence forms;
- ID-driven numbering and caption-only behavior;
- label/prefix frontmatter and English/empty fallbacks;
- insertion/reordering effects, manual and automatic references;
- source editing and command-click placement;
- source-line numbering versus listing numbering;
- exact output differences for HTML, EPUB, DOCX, ODT, processed Markdown, LaTeX, and PDF;
- why idiomatic highlighting is required for visible native captions;
- that caption-only LaTeX listings use an unnumbered title;
- that ID-only listings use a generated zero-width native caption;
- that labels use frontmatter, not the UI language;
- template styling classes `.listing` and `.listing-caption`.

- [ ] **Step 3: Add fixture probes**

`default-document.js` must still round-trip the exact source. Figure and listing fixture probes must assert `Figure 2-1`, `Code excerpt 2-1`, the unnumbered caption case, and the reference texts.

Run:

```bash
npm run probe -- --fixture default-document.md test/probes/default-document.js
npm run probe -- --fixture default-document.md test/probes/figure-crossrefs-default-document.js
npm run probe -- --fixture default-document.md test/probes/listing-crossrefs-default-document.js
```

- [ ] **Step 4: Update cross-reference documentation indexes**

If `docs/ai-context.md`, `docs/architecture.md`, or `test/README.md` names the implemented reference kinds or probe list, add listings and the shared vocabulary there. Keep the existing documentation-check rules green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/documentation/documentation.en.md test/fixtures/workspace/default-document.md \
  test/probes/default-document.js test/probes/figure-crossrefs-default-document.js \
  test/probes/listing-crossrefs-default-document.js docs/ai-context.md docs/architecture.md test/README.md
git commit -m "docs: explain listing cross-references"
```

---

### Task 7: Full verification and final fixes

**Files:**
- Modify only files implicated by failures.

- [ ] **Step 1: Restart the app on the feature branch**

Stop the running Tauri dev session, start `npm run tauri dev`, and wait for the MCP bridge.

- [ ] **Step 2: Run all static checks**

Run:

```bash
npx tsc --noEmit
cargo test
npm run check
```

Expected: all pass.

- [ ] **Step 3: Run all Tauri probes**

Run: `npm run probe:all`

Expected: all non-skipped probes pass. If an order-sensitive failure occurs, restart once and reproduce the failing probe by name; fix only a real regression.

- [ ] **Step 4: Visually inspect the default document**

Capture the listing section through the Tauri MCP bridge. Confirm:

- labels and captions sit below code;
- caption-only is unnumbered;
- ID-only and full listing labels use the configured prefix;
- source mode shows one original fence and hides the generated caption;
- no code text is clipped or overlapped by the language button.

- [ ] **Step 5: Commit any verification fixes**

If verification fixes are needed:

```bash
git add -u
git commit -m "fix(crossrefs): settle listing integration"
```

- [ ] **Step 6: Report**

Report changed behavior, commit hashes, the tests/probes that prove it, and leave the feature branch unmerged.
