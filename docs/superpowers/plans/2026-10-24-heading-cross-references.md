# Heading Cross-References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix typing a heading on an empty line, then add Pandoc-compatible ATX and setext heading attributes, automatic heading IDs, and same-document command-click navigation.

**Architecture:** A pure heading syntax module owns attribute recognition and Pandoc ID generation. The parser attaches its result to heading nodes and removes attributes from rendered children; the document lazily exposes a heading index; the heading component conditionally renders attributes while the caret is in that heading; click routing resolves `#fragment` links through the index.

**Tech Stack:** TypeScript, unified/remark/micromark, mdast, Tauri MCP probes, Node rolldown checks.

**Spec:** `docs/superpowers/specs/2026-10-24-heading-cross-references-design.md`

## Global Constraints

- Work only on `codex/*` branches; never commit to `main` and never merge without an explicit request.
- Always test editor behavior through the running Tauri app and its MCP bridge.
- Restart the Tauri dev app after changing branches or page modules.
- Preserve unrelated `package-lock.json` and `src-tauri/Cargo.lock` working-tree changes.
- Do not put DOM imports in syntax modules.
- Every new TypeScript module starts with the repository's three-line module header.
- Preserve native Pandoc heading attributes and `[text](#id)` links in every export.
- Heading cross-references are same-document only.
- Apply only an explicit ID to the editor DOM; classes and key/value attributes are export metadata.
- Explicit duplicate IDs remain duplicated in export; Yi navigates to the first match.
- Processed Markdown preserves heading attributes and fragment links.

---

## Branch setup

The specification and plan are committed on `codex/heading-cross-references`.
Before Task 1:

```bash
git switch main
git switch -c codex/type-heading-on-a-blank-line
```

After Task 1 is committed, return to the specification branch and put it on top
of the bug fix. This keeps the bug commit as a reviewable prerequisite and keeps
the feature diff clean against that prerequisite:

```bash
git switch codex/heading-cross-references
git rebase codex/type-heading-on-a-blank-line
```

Tasks 2–7 run on `codex/heading-cross-references`.

---

### Task 1: Type a heading on an empty line

**Files:**

- Create: `test/probes/blank-line-heading.js`
- Modify: `src/ui/markdown/caret/offsets.ts`
- Test: `test/probes/blank-line-heading.js`

**Interfaces:**

- Consumes: `documentOffsetAt(state, container, positionOffset): CaretLocation | null`
- Produces: the same function, now mapping a caret in a rendered empty heading to the heading's raw end.

- [ ] **Step 1: Create the failing Tauri probe**

```js
/**
 * Typing a heading marker on an empty line remains possible until its space and title exist.
 *
 * @covers src/ui/markdown/caret/offsets.ts, src/ui/markdown/nodes/heading.ts
 * @fixture test/fixtures/workspace/default-document.md
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });

  await t.load('---\ntitle: Heading check\n---\n\n');
  const blank = t.prose().querySelector('.markdown-empty-line-placeholder');
  await t.click(blank, 0.05);
  for (const key of ['#', '#', ' ', 'H', 'e', 'a', 'd']) {
    t.key(key);
    await t.sleep(80);
  }
  await t.sleep(250);

  const raw = await t.raw();
  const heading = t.prose().querySelector('h2');
  check('the raw text has both heading markers and a title', raw, '---\ntitle: Heading check\n---\n\n## Head\n');
  check('the second marker reaches the document', raw.includes('\n## Head\n'), true);
  check('the rendered heading is level two', heading?.textContent?.trim() ?? null, 'Head');
  check('the caret stayed in the heading while typing', t.caretRect() !== null, true);

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
```

- [ ] **Step 2: Run the probe and verify it fails**

Run:

```bash
npm run probe -- --with-workspace --fixture default-document.md test/probes/blank-line-heading.js
```

Expected: FAIL because the second `#` does not reach the raw document or the final heading title is not `Head`.

- [ ] **Step 3: Map an empty heading's element position to its raw end**

In `src/ui/markdown/caret/offsets.ts`, immediately before the generic empty-block-element fallback:

```ts
// An empty ATX heading renders no text node, but its markers are still characters in
// the document. The caret the editor places on the heading element therefore means the
// position after those markers; mapping it to rendered text would fail because there is
// none, and the next typed marker would be swallowed.
if (
  blockElement.matches('.markdown-heading') &&
  (blockElement.textContent ?? '').length === 0
) {
  return {
    block,
    offset: block.charEnd,
    blockOffset: block.charEnd - block.charStart
  };
}
```

- [ ] **Step 4: Run the probe and verify it passes**

Run:

```bash
npm run probe -- --with-workspace --fixture default-document.md test/probes/blank-line-heading.js
```

Expected: all checks pass; the raw document is `## Head` and the rendered heading is level two.

- [ ] **Step 5: Run focused regression probes**

Run:

```bash
npm run probe -- --with-workspace --fixture default-document.md test/probes/heading-level-markers.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/placeholder-boxes.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/typed-text.js
```

Expected: every probe reports an empty `failed` array.

- [ ] **Step 6: Commit the separate bug fix**

```bash
git add src/ui/markdown/caret/offsets.ts test/probes/blank-line-heading.js
git commit -m "fix(editor): type headings on empty lines"
```

---

### Task 2: Parse and serialize heading attribute blocks

**Files:**

- Create: `src/ui/markdown/syntax/heading_attributes.ts`
- Create: `src/ui/markdown/plugins/remark-heading-attributes.ts`
- Create: `test/checks/check-heading-attributes.mjs`
- Modify: `src/ui/markdown/mdast.d.ts`
- Modify: `src/ui/markdown/syntax/parser.ts`

**Interfaces:**

- Produces:

```ts
export interface HeadingAttributeBlock {
  /** Block-relative start of the separating whitespace plus `{…}`. */
  from: number;
  /** Block-relative end, exclusive. */
  to: number;
  /** The original ` {…}` source, including the separating whitespace. */
  source: string;
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
}

export function readHeadingAttributes(source: string): HeadingAttributeBlock | null;
```

- Adds `HeadingAttributeBlock | undefined` as `headingAttributes` on mdast `Heading`.
- Consumes `parseMarkdown(source): Root` and `serializeMarkdown(tree): string`.

- [ ] **Step 1: Write failing Node checks**

Create `test/checks/check-heading-attributes.mjs` with the same rolldown loader used by `check-parser.mjs`, then:

```js
const { readHeadingAttributes } = await load(
  'src/ui/markdown/syntax/heading_attributes.ts',
  'heading_attributes'
);
const { parseMarkdown, serializeMarkdown } = await load(
  'src/ui/markdown/syntax/parser.ts',
  'parser'
);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

check(
  'an ATX heading reads its trailing attributes',
  (() => {
    const found = readHeadingAttributes('## Methods {#methods .unnumbered data-owner=demo}');
    return found && {
      source: found.source,
      id: found.id,
      classes: found.classes,
      attributes: found.attributes
    };
  })(),
  {
    source: ' {#methods .unnumbered data-owner=demo}',
    id: 'methods',
    classes: ['unnumbered'],
    attributes: { 'data-owner': 'demo' }
  }
);
check(
  'a setext heading reads attributes from its title line',
  readHeadingAttributes('Methods {#methods .unnumbered}\n==============================')?.id,
  'methods'
);
check(
  'quoted values and escaped spaces are one value',
  readHeadingAttributes('# A {key="one two" other=two\\ words}')?.attributes,
  { key: 'one two', other: 'two words' }
);
check('an unseparated brace is heading text', readHeadingAttributes('## Methods{#methods}'), null);
check('an unterminated brace is heading text', readHeadingAttributes('## Methods {#methods'), null);
check('a non-final brace is heading text', readHeadingAttributes('## {#methods} Methods'), null);
check(
  'the heading parse hides attributes from rendered children',
  parseMarkdown('## Methods {#methods .unnumbered}\n').children[0].children.map((child) => child.value),
  ['Methods']
);
check(
  'serialization restores the attribute block',
  serializeMarkdown(parseMarkdown('## Methods {#methods .unnumbered}\n')).trim(),
  '## Methods {#methods .unnumbered}'
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('heading attributes: all checks passed');
```

- [ ] **Step 2: Run the check and verify it fails**

```bash
node test/checks/check-heading-attributes.mjs
```

Expected: FAIL because `heading_attributes.ts` does not exist.

- [ ] **Step 3: Implement the pure attribute reader**

`src/ui/markdown/syntax/heading_attributes.ts` identifies the heading content line:

- ATX: `^ {0,3}#{1,6}(?:[ \t]|$)`, excluding an optional closing `###` sequence;
- setext: the line before a final `^ {0,3}(?:=+|-+)[ \t]*$` underline;
- otherwise: no attribute block.

It scans backward from the content end for an unescaped `{`, validates balanced
quotes/braces, requires whitespace before `{`, and parses tokens as `#id`,
`.class`, or `key=value`. It removes surrounding quotes and resolves `\ ` and
`\"` inside values. It returns `null` for an invalid token or missing
identifier/class/key-value token.

Use this public shape:

```ts
export interface HeadingAttributeBlock {
  from: number;
  to: number;
  source: string;
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
}

export function readHeadingAttributes(source: string): HeadingAttributeBlock | null {
  const contentEnd = headingContentEnd(source);
  if (contentEnd === null) return null;
  const trimmedEnd = trimSpacesBack(source, contentEnd);
  if (source[trimmedEnd - 1] !== '}') return null;
  const open = matchingOpenBrace(source, trimmedEnd - 1);
  if (open < 1 || !/\s/.test(source[open - 1])) return null;
  const parsed = parseAttributeTokens(source.slice(open + 1, trimmedEnd - 1));
  if (parsed === null) return null;
  const from = trimSpacesBack(source, open);
  return { from, to: trimmedEnd, source: source.slice(from, trimmedEnd), ...parsed };
}
```

Implement `headingContentEnd`, `trimSpacesBack`, `matchingOpenBrace`, and
`parseAttributeTokens` as local helpers in the same module. They are pure
string functions and have no DOM imports.

- [ ] **Step 4: Attach attributes in the parser**

Create `remark-heading-attributes.ts`. Its transformer walks headings, takes each
heading's raw range from `node.position`, calls `readHeadingAttributes(raw)`, stores
the result on `node.headingAttributes`, and removes the range from the final text
child's `value` and end position.

Register it after `remarkWikilink` in both `parseProcessor` and
`fragmentProcessor`.

Add a `heading` stringify handler that serializes the children and appends
`node.headingAttributes?.source ?? ''`.

Add to `src/ui/markdown/mdast.d.ts`:

```ts
declare module 'mdast' {
  interface Heading {
    headingAttributes?: import('./syntax/heading_attributes').HeadingAttributeBlock;
  }
}
```

- [ ] **Step 5: Run the attribute checks**

```bash
node test/checks/check-heading-attributes.mjs
```

Expected: `heading attributes: all checks passed`.

- [ ] **Step 6: Run parser and property checks**

```bash
npm run check
```

Expected: every existing check plus `check-heading-attributes.mjs` passes.

- [ ] **Step 7: Commit parser support**

```bash
git add src/ui/markdown/syntax/heading_attributes.ts \
  src/ui/markdown/plugins/remark-heading-attributes.ts \
  src/ui/markdown/mdast.d.ts src/ui/markdown/syntax/parser.ts \
  test/checks/check-heading-attributes.mjs
git commit -m "feat(markdown): parse heading attributes"
```

---

### Task 3: Build the Pandoc heading index

**Files:**

- Create: `src/ui/markdown/syntax/pandoc_identifiers.ts`
- Create: `src/ui/markdown/document/heading_index.ts`
- Create: `test/checks/check-heading-index.mjs`
- Modify: `src/ui/markdown/document/state.ts`

**Interfaces:**

- Produces:

```ts
export function pandocHeadingId(text: string): string;

export interface HeadingTarget {
  id: string;
  from: number;
  to: number;
  title: string;
  explicit: boolean;
}

export function headingIndex(markdown: string): HeadingTarget[];
```

- `MarkdownEditorState.headingTargets(): readonly HeadingTarget[]` returns a
  cached index invalidated by every text update.

- [ ] **Step 1: Write failing ID and index checks**

Create `test/checks/check-heading-index.mjs` using the parser-check loader. Test:

```js
check('spaces become hyphens', pandocHeadingId('A Heading!'), 'a-heading');
check('underscore, hyphen, and period remain', pandocHeadingId('A_B.C!'), 'a_b.c');
check('text before the first letter is removed', pandocHeadingId('123 start'), 'start');
check('Unicode lowercase is preserved', pandocHeadingId('中文 Heading'), '中文-heading');
check('punctuation alone falls back', pandocHeadingId('—'), 'section');

const targets = headingIndex(
  '# Same\n\n# Same\n\n# Custom {#same}\n\nTitle {#setext .unnumbered}\n=====\n'
);
check(
  'automatic duplicates use Pandoc suffixes and explicit IDs stay literal',
  targets.map((target) => target.id),
  ['same', 'same-1', 'same', 'setext']
);
check(
  'an explicit ID is marked explicit',
  targets.map((target) => target.explicit),
  [false, false, true, true]
);
check(
  'a fragment finds the first matching target',
  firstHeadingTarget(targets, 'same')?.from,
  targets[0].from
);
```

- [ ] **Step 2: Run the check and verify it fails**

```bash
node test/checks/check-heading-index.mjs
```

Expected: FAIL because the ID and index modules do not exist.

- [ ] **Step 3: Implement Pandoc identifiers**

In `pandoc_identifiers.ts`, implement the published Pandoc rules over the
heading's plain text:

```ts
export function pandocHeadingId(text: string): string {
  let at = text.search(/\p{L}/u);
  if (at < 0) return 'section';
  return text
    .slice(at)
    .toLowerCase()
    .replace(/\s+/gu, '-')
    .replace(/[^\p{L}\p{N}_.-]/gu, '');
}
```

- [ ] **Step 4: Implement the parser-backed index**

In `heading_index.ts`, call `parseMarkdown(markdown)`, walk every heading in
document order, collect its plain child text, and choose
`node.headingAttributes?.id ?? pandocHeadingId(title)`.

Keep a `Set` of IDs already used, including explicit IDs. For an automatic ID
collision, increment `-1`, `-2`, … until unused. Do not rewrite an explicit ID.

Each target uses the node's absolute position:

```ts
{
  id,
  from: node.position.start.offset,
  to: node.position.end.offset,
  title: plainText,
  explicit: node.headingAttributes?.id != null
}
```

Also export:

```ts
export function firstHeadingTarget(
  targets: readonly HeadingTarget[],
  id: string
): HeadingTarget | null {
  return targets.find((target) => target.id === id) ?? null;
}
```

- [ ] **Step 5: Cache the index in editor state**

Add `private cachedHeadings: readonly HeadingTarget[] | null = null` to
`MarkdownEditorState`. Clear it in `updateText` after the text changes. Add:

```ts
headingTargets(): readonly HeadingTarget[] {
  this.cachedHeadings ??= headingIndex(this.getText());
  return this.cachedHeadings;
}
```

- [ ] **Step 6: Run ID, index, and document checks**

```bash
node test/checks/check-heading-index.mjs
npm run check
```

Expected: all checks pass.

- [ ] **Step 7: Commit the index**

```bash
git add src/ui/markdown/syntax/pandoc_identifiers.ts \
  src/ui/markdown/document/heading_index.ts \
  src/ui/markdown/document/state.ts test/checks/check-heading-index.mjs
git commit -m "feat(markdown): index pandoc heading ids"
```

---

### Task 4: Render heading IDs and reveal attributes at the caret

**Files:**

- Modify: `src/ui/markdown/nodes/heading.ts`
- Modify: `src/ui/markdown/editing/context.ts`
- Modify: `src/ui/markdown/caret/offsets.ts`
- Modify: `src/ui/markdown/caret/dom_position.ts`
- Modify: `src/ui/markdown/render_context.ts`
- Modify: `src/ui/markdown/markdown_editor.ts`
- Modify: `src/styles.css`
- Create: `test/probes/heading-attributes.js`

**Interfaces:**

- Heading elements expose the resolved document ID as their DOM `id`.
- `RenderContext.headingId(from: number): string | null` answers the ID for a
  heading whose absolute source start is `from`.
- A heading attribute span has class `markdown-heading-attributes-source`, carries
  `data-source-from`, and contains the exact source from `HeadingAttributeBlock.source`.
- `sourceRangeIn` maps a caret anywhere inside a heading with attributes to that
  attribute block's range.

- [ ] **Step 1: Write the failing Tauri probe**

Create `test/probes/heading-attributes.js`:

```js
/**
 * Heading attributes hide outside their heading and remain editable inside it.
 *
 * @covers src/ui/markdown/nodes/heading.ts, src/ui/markdown/editing/context.ts
 * @fixture test/fixtures/workspace/default-document.md
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });

  await t.load('# Before\n\n## Methods {#methods .unnumbered}\n\nAfter\n');
  const heading = t.prose().querySelector('h2');
  check('attributes are hidden outside the heading', heading.textContent.trim(), 'Methods');
  check('the heading carries its custom id', heading.id, 'methods');

  await t.click(heading, 0.5);
  await t.sleep(250);
  const source = t.prose().querySelector('.markdown-heading-attributes-source');
  check('attributes appear inside the heading', source?.textContent ?? null, ' {#methods .unnumbered}');

  await t.click(source, 0.64);
  t.key('x');
  await t.sleep(250);
  check('typing lands in the attribute source', (await t.raw()).includes('methodsx'), true);

  await t.click(t.prose().querySelector('h1'), 0.5);
  await t.sleep(250);
  check(
    'attributes hide again after leaving the heading',
    t.prose().querySelector('.markdown-heading-attributes-source'),
    null
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
```

- [ ] **Step 2: Run the probe and verify it fails**

```bash
npm run probe -- --with-workspace --fixture default-document.md test/probes/heading-attributes.js
```

Expected: FAIL because attributes are rendered as heading text and no custom ID exists.

- [ ] **Step 3: Resolve and apply the ID**

Add `headingId(from: number): string | null` to `RenderContext`, returning `null`
from the default context. In `markdown_editor.ts`, install:

```ts
headingId: (from) =>
  this.state.headingTargets().find((target) => target.from === from)?.id ?? null
```

In `Heading`, read `node.headingAttributes?.id`. For an automatic ID, add the
rendering block's `charStart` to the heading node's block-relative start and ask
`renderContext().headingId(from)`. Set `this.element.id` only when an ID is
resolved.

- [ ] **Step 4: Render attribute source conditionally**

When `node.headingAttributes` exists and
`isShownSourceRange(attributes.from, attributes.to)` is true, append:

```ts
const source = document.createElement('span');
source.className =
  'markdown-heading-attributes-source markdown-source-view markdown-node';
setOffset(source, SOURCE_FROM, attributes.from);
source.textContent = attributes.source;
this.element.appendChild(source);
```

Add `.markdown-heading-attributes-source` to `SOURCE_SELECTOR` in `offsets.ts`.
Add CSS with `white-space: pre-wrap` and the same source styling used by other
revealed source spans.

- [ ] **Step 5: Make a heading's caret show only its attributes**

In `editing/context.ts: sourceRangeIn`, before registry lookup:

```ts
if (node.type === 'heading') {
  const end = (node as { position?: { end?: { offset?: number } } }).position?.end?.offset;
  const attributes = (node as AstHeading).headingAttributes;
  return attributes && end !== undefined && offset <= end
    ? { start: attributes.from, end: attributes.to }
    : null;
}
```

Do not register the whole heading as a source-mode node.

- [ ] **Step 6: Verify caret mapping in both directions**

`domPositionAtOffset` already prefers source spans tagged with `SOURCE_FROM`.
Add a check to the probe that deletes one character from the ID and then uses
Left/Right across the attribute span; the caret must remain visible and the raw
text must change only at the chosen character.

- [ ] **Step 7: Run the heading-attribute probe**

```bash
npm run probe -- --with-workspace --fixture default-document.md test/probes/heading-attributes.js
```

Expected: every check passes, including visibility toggling and exact editing.

- [ ] **Step 8: Run related caret probes**

```bash
npm run probe -- --with-workspace --fixture default-document.md test/probes/heading-level-markers.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/pointer.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/typed-text.js
```

Expected: all pass.

- [ ] **Step 9: Commit heading rendering**

```bash
git add src/ui/markdown/nodes/heading.ts src/ui/markdown/editing/context.ts \
  src/ui/markdown/caret/offsets.ts src/ui/markdown/caret/dom_position.ts \
  src/ui/markdown/render_context.ts src/ui/markdown/markdown_editor.ts \
  src/styles.css test/probes/heading-attributes.js
git commit -m "feat(editor): reveal heading attributes at the caret"
```

---

### Task 5: Navigate fragment links to headings

**Files:**

- Create: `src/ui/markdown/editing/headings.ts`
- Modify: `src/ui/markdown/click_routing.ts`
- Modify: `src/ui/markdown/syntax/link_edits.ts`
- Modify: `src/services/messages.ts`
- Modify: `locales/en.json`
- Modify: `locales/de.json`
- Modify: `locales/es.json`
- Modify: `locales/fr.json`
- Modify: `locales/ja.json`
- Modify: `locales/pt.json`
- Modify: `locales/zh-Hans.json`
- Modify: `locales/zh-Hant.json`
- Create: `test/probes/heading-crossrefs.js`
- Modify: `test/probes/link-cmd-click.js`

**Interfaces:**

- Produces `isSameDocumentFragment(destination: string): boolean` in
  `syntax/link_edits.ts`.
- Produces `jumpToHeading(context, fragment): boolean` in
  `editing/headings.ts`.
- `routeLinkClick(event)` calls `jumpToHeading` before URL/file routing.
- `showMessage(text: string): void` is the one non-error entry point for a
  localized message.

- [ ] **Step 1: Write failing fragment-classification checks**

Extend `check-link-edits.mjs`:

```js
check('a local fragment is a heading target', isSameDocumentFragment('#methods'), true);
check('an encoded local fragment is a heading target', isSameDocumentFragment('#C%20Methods'), true);
check('an external file fragment is not', isSameDocumentFragment('note.md#methods'), false);
check('an empty fragment is not a target', isSameDocumentFragment('#'), false);
```

- [ ] **Step 2: Write the failing Tauri navigation probe**

Create `test/probes/heading-crossrefs.js` with documents covering:

```js
const document =
  '# Start\n\n' +
  '[Automatic](#a-heading)\n\n' +
  '[Duplicate](#a-heading-1)\n\n' +
  '[Custom](#methods)\n\n' +
  '# A Heading\n\n' +
  'Middle text.\n\n' +
  '# A Heading\n\n' +
  '## Methods {#methods .unnumbered}\n\n' +
  'Target text.\n';
```

Dispatch complete `click` events with `metaKey: true` and assert:

- `location.hash` never changes;
- the resolved heading receives an inline caret;
- a target below the mounted viewport is revealed;
- a plain click reveals the link source instead;
- `#missing` leaves the document stationary and shows a `[data-message-text]`
  containing `missing`.
- `note.md#methods` does not resolve as a heading.

- [ ] **Step 3: Run the checks and verify they fail**

```bash
node test/checks/check-link-edits.mjs
npm run probe -- --with-workspace --fixture default-document.md test/probes/heading-crossrefs.js
```

Expected: the fragment checks fail because the classifier and navigator do not exist.

- [ ] **Step 4: Implement fragment classification**

In `syntax/link_edits.ts`:

```ts
export function isSameDocumentFragment(destination: string): boolean {
  const text = destination.trim();
  return /^#[^#]+$/.test(text) && text !== '#';
}
```

- [ ] **Step 5: Implement heading navigation**

`editing/headings.ts`:

```ts
export function jumpToHeading(context: EditorContext, destination: string): boolean {
  let id: string;
  try {
    id = decodeURIComponent(destination.trim().slice(1));
  } catch {
    return false;
  }
  const target = firstHeadingTarget(context.state.headingTargets(), id);
  if (!target) {
    showMessage(t('heading.notFound', { id }));
    return true;
  }
  context.renderer.revealOffset(target.from);
  return restoreCaret(context, target.from);
}
```

The function returns true for both a successful jump and a handled missing
target, so the webview never follows the fragment.

- [ ] **Step 6: Route fragment clicks**

Before URL/file handling in `routeLinkClick`:

```ts
if (isSameDocumentFragment(href)) {
  event.preventDefault();
  event.stopPropagation();
  jumpToHeading(context, href);
  return;
}
```

Pass `EditorContext` into `routeLinkClick` from `markdown_editor.ts`.

- [ ] **Step 7: Add the localized message**

Add this exported wrapper in `services/messages.ts` and call it from `notify`:

```ts
export function showMessage(text: string): void {
  void eventManager.emit(MESSAGE_EVENT, { text } satisfies Message);
}
```

Add `heading.notFound` to every locale:

```json
"heading.notFound": "No heading has the id “{id}”."
```

Translate the sentence in each existing locale rather than copying English.

- [ ] **Step 8: Run navigation checks and probes**

```bash
node test/checks/check-link-edits.mjs
npm run check
npm run probe -- --with-workspace --fixture default-document.md test/probes/heading-crossrefs.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/link-cmd-click.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/link-opens-a-note.js
```

Expected: all pass; the existing fragment expectation in `link-cmd-click.js`
is updated to assert a heading jump instead of source opening.

- [ ] **Step 9: Commit navigation**

```bash
git add src/ui/markdown/editing/headings.ts src/ui/markdown/click_routing.ts \
  src/ui/markdown/markdown_editor.ts src/ui/markdown/syntax/link_edits.ts \
  src/services/messages.ts locales test/checks/check-link-edits.mjs \
  test/probes/heading-crossrefs.js test/probes/link-cmd-click.js
git commit -m "feat(editor): jump to heading cross-references"
```

---

### Task 6: Update the default document and user documentation

**Files:**

- Modify: `test/fixtures/workspace/default-document.md`
- Modify: `src/ui/documentation/documentation.en.md`
- Create: `test/probes/heading-crossrefs-default-document.js`
- Modify: `test/README.md`
- Modify: `docs/ai-context.md`
- Modify: `docs/architecture.md`

**Interfaces:**

- Consumes all constructs from Tasks 2–5.
- Produces a user-visible example whose headings, IDs, duplicate suffix, and
  links are exercised against the actual default fixture.

- [ ] **Step 1: Add the fixture section**

Append before the final demonstration sentence:

```markdown
## Heading cross-references

Jump to [automatic heading IDs](#automatic-heading-ids),
[the repeated heading](#automatic-heading-ids-1),
[custom heading attributes](#reading-methods), or
[a setext heading](#setext-heading).

### Automatic heading IDs

Pandoc derives this section's ID from its text.

### Automatic heading IDs

This repeated title receives the suffix `-1`.

### Reading methods {#reading-methods .unnumbered data-owner=demo}

Move the caret into this heading to edit its ID, class, and key/value attribute.

Setext heading with attributes {#setext-heading .unnumbered}
===========================================================

ATX and setext headings preserve trailing Pandoc attributes.
```

- [ ] **Step 2: Add the user guide**

Add `## Cross-references and heading attributes` to
`src/ui/documentation/documentation.en.md`, covering:

- `[text](#id)` as the link syntax;
- same-document scope;
- automatic ID derivation and duplicate suffixes;
- `{#id .class key=value}` on ATX and setext headings;
- ID-only editor styling;
- attribute visibility while the caret is in the heading;
- explicit duplicate-ID guidance;
- ⌘-click and Ctrl-click navigation;
- native retention in Pandoc and processed-Markdown exports.

- [ ] **Step 3: Prove the fixture end to end**

Create `test/probes/heading-crossrefs-default-document.js` that runs against
`window.__probeDoc` and asserts:

- the fixture contains all three destinations;
- rendered IDs are `automatic-heading-ids`,
  `automatic-heading-ids-1`, `reading-methods`, and `setext-heading`;
- command-click reaches each destination;
- the three attribute kinds appear when the custom heading has the caret.

- [ ] **Step 4: Update project documentation**

Update `test/README.md` with the new probes and checks. Update
`docs/ai-context.md` and `docs/architecture.md` to name:

- `syntax/heading_attributes.ts` as the attribute grammar;
- `syntax/pandoc_identifiers.ts` as the ID rule;
- `document/heading_index.ts` as the cached document index;
- `editing/headings.ts` as the navigation command.

- [ ] **Step 5: Run documentation and fixture probes**

```bash
npm run probe -- --with-workspace --fixture default-document.md test/probes/default-document.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/heading-crossrefs-default-document.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/documentation.js
npm run check
```

Expected: all pass.

- [ ] **Step 6: Commit fixture and user documentation**

```bash
git add test/fixtures/workspace/default-document.md \
  src/ui/documentation/documentation.en.md \
  test/probes/heading-crossrefs-default-document.js \
  test/README.md docs/ai-context.md docs/architecture.md
git commit -m "docs(markdown): show heading cross-references"
```

---

### Task 7: Prove export and the complete behavior

**Files:**

- Modify: `test/checks/check-export.mjs`
- Modify: `test/probes/export-kinds.js`
- Modify: `test/probes/export-pandoc-arguments.js`
- Verify: `src/ui/export/preprocess.ts` requires no rewrite

**Interfaces:**

- Consumes `exportSource(text, answers)`.
- Produces evidence that neither heading attributes nor fragment links are rewritten.

- [ ] **Step 1: Add a failing export unit check**

In `check-export.mjs`, add:

```js
const crossreferences =
  '# Start\n\n' +
  'See [Methods](#methods).\n\n' +
  '## Methods {#methods .unnumbered data-owner=demo}\n';
const { rendered } = await render(crossreferences);
check(
  'processed markdown keeps native fragment links and heading attributes',
  rendered,
  crossreferences
);
```

Expected before implementation: this check may already pass. Keep it as a
regression guard for the rule that preprocessing must not touch these nodes.

- [ ] **Step 2: Add the app export assertion**

Extend `export-kinds.js` to write the cross-reference Markdown document through
the Markdown export command and read the target file. Assert its text equals the
expected export text, including `[Methods](#methods)` and
`{#methods .unnumbered data-owner=demo}`.

- [ ] **Step 3: Run export checks**

```bash
node test/checks/check-export.mjs
npm run probe -- --with-workspace --fixture default-document.md test/probes/export-kinds.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/export-pandoc-arguments.js
```

Expected: all pass.

- [ ] **Step 4: Restart the app from the final branch**

Stop the old `npm run tauri dev`, switch to the final feature branch, start
`npm run tauri dev`, and confirm the port 9223 bridge responds before running
more probes.

- [ ] **Step 5: Run the complete verification**

```bash
npx tsc --noEmit
cargo test
npm run check
npm run probe:all
```

Expected: type check silent, Rust tests pass, every Node check passes, and every
probe has an empty `failed` array.

- [ ] **Step 6: Measure first heading-index lookup on the fixture**

Run the final default-document probe with timing and record the first
command-click latency. If it exceeds 100 ms, optimize `headingIndex` before
declaring the feature complete.

- [ ] **Step 7: Commit export coverage**

```bash
git add test/checks/check-export.mjs test/probes/export-kinds.js \
  test/probes/export-pandoc-arguments.js
git commit -m "test(export): retain heading cross-references"
```

- [ ] **Step 8: Report without merging**

Report:

- the blank-line probe that failed before its fix;
- the attribute and navigation probes that failed before the feature;
- all commands and their results;
- first-index latency;
- branch names and commit hashes;
- that no merge was performed.
