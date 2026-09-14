# Blank Lines and Compact Block Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the author start a new paragraph anywhere — `Enter` at the end of a paragraph puts the caret on a real, typable empty line — while keeping the reading view as compact as typeset prose.

**Architecture:** The raw document stays the single source of truth and block slicing stays a pure function of it. `splitBlocks` gains a `blank` block kind: in a run of blank lines between two blocks the first is markdown's separator (a margin, no line) and every further blank line becomes an empty-paragraph block with its own placeholder and caret home. `Enter` inserts one newline at the end of a block (the run grows, an empty paragraph appears), the newlines of a paragraph break inside a block, or one newline on an empty line itself. Typing on an empty line inserts the text plus the newline markdown needs on the other side. Block spacing stops coming from a generic wrapper margin and comes from the content's own margins, which are already part of each block's measured height.

**Tech Stack:** TypeScript 7, unified/remark (micromark), Vite + Tailwind CSS 4 + daisyUI, Tauri 2 with the MCP bridge on port 9223, Node 26 for the probe harness.

**Spec:** `docs/superpowers/specs/2026-09-14-blank-lines-and-compact-spacing-design.md`

## Global Constraints

- Every behaviour change is verified **in the running app through the Tauri MCP bridge** (`npm run tauri dev`, bridge on `127.0.0.1:9223`, window `main`). Node-level checks are not a substitute.
- `npx tsc --noEmit` must pass after every task.
- `splitBlocks` and the offset mapping stay pure functions of the raw text: no caret-dependent state may leak into the block model.
- Offsets stay block-relative; a global offset is always `block.charStart + relative`.
- No new runtime dependency; the only new tooling is the probe harness under `scripts/`.
- One user keystroke is one undo step (`replaceRange` once).
- The editor inserts nothing the author did not ask for: only the newlines the spec's §2 lists.
- Keep the existing module boundaries: parse-input rewrites live in `trailing_spaces.ts` / `empty_items.ts`, commands in `editing/`, node markup in `create_block.ts` / `nodes/`.
- `src/ui/markdown/editing/` is uncommitted work from an earlier session; keep its structure and comment style.

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/tauri-probe.mjs` (new) | Runs a probe inside the app through the MCP bridge |
| `scripts/probes/lib.js` (new) | Shared in-page helpers (`window.__t`) |
| `scripts/probes/*.js` (new) | One probe per behaviour, re-runnable after every change |
| `src/styles.css` (modify) | Spacing tokens, empty-paragraph line height, blank-block intrinsic size |
| `src/ui/markdown/blank_lines.ts` (new) | Run rule: which blank lines become empty paragraphs |
| `src/ui/markdown/blocks.ts` (modify) | `blank` kind, emit empty-paragraph blocks, list boundary |
| `src/ui/markdown/state.ts` (modify) | No parse for `blank` blocks; `firstEmptyParagraphAfter` |
| `src/ui/markdown/create_block.ts` (modify) | Render a `blank` block as an empty paragraph with placeholder |
| `src/ui/markdown/position.ts` (modify) | Map positions on the empty-line placeholder to the line start |
| `src/ui/markdown/editing/context.ts` (modify) | `applyEdit` accepts a caret derived from the post-edit state |
| `src/ui/markdown/editing/blank_lines.ts` (new) | Enter rules, typing materialisation, empty-line removal |
| `src/ui/markdown/editing/line_removal.ts` (new) | The line-removal range shared by items and empty paragraphs |
| `src/ui/markdown/editing/text_commands.ts` (modify) | Route Enter/typing/deleting through the new rules |
| `src/ui/markdown/editing/pointer.ts` (new) | Margin clicks and clicks below the last line |
| `src/ui/markdown/markdown_editor.ts` (modify) | Wire pointer rules, mark the scroller |
| `src/ui/markdown/caret/caret.ts` (modify) | Keep the caret on clicks inside the editor |
| `src/ui/markdown/virtual_block_renderer.ts` (modify) | Block gap drops to 0: spacing lives inside the measured heights |

---

### Task 1: Probe harness and compact spacing tokens

**Files:**
- Create: `scripts/tauri-probe.mjs`
- Create: `scripts/probes/lib.js`
- Create: `scripts/probes/spacing.js`
- Modify: `src/styles.css`
- Modify: `src/ui/markdown/virtual_block_renderer.ts`

**Interfaces:**
- Produces: `node scripts/tauri-probe.mjs <probe.js>` — prints the probe's JSON result, exits non-zero on bridge errors, prepends `scripts/probes/lib.js` to the probe source.
- Produces: `window.__t` in the app with `prose()`, `scroller()`, `blocks()`, `load(markdown)`, `raw()`, `key(name)`, `click(element, ratio, dy)`, `caretRect()`, `styles(selector)`, `gaps()`, `sleep(ms)`.

- [ ] **Step 1: Write the probe harness**

Create `scripts/tauri-probe.mjs`:

```js
/**
 * Runs a probe script inside the running editor through the Tauri MCP bridge.
 *
 * Usage: node scripts/tauri-probe.mjs scripts/probes/<name>.js
 *
 * The probe is a plain script evaluated in the webview; it may return a value
 * (or a promise) which is printed as JSON. `scripts/probes/lib.js` is
 * prepended so every probe starts with `window.__t` available.
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/tauri-probe.mjs <probe.js>');
  process.exit(2);
}

const lib = readFileSync(new URL('./probes/lib.js', import.meta.url), 'utf8');
const probe = readFileSync(file, 'utf8');
const script = `${lib}\n${probe}`;

async function connect() {
  for (let port = 9223; port < 9233; port += 1) {
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', () => reject(new Error(`port ${port} refused`)), {
          once: true
        });
      });
      return ws;
    } catch {
      /* try the next port */
    }
  }
  throw new Error('no MCP bridge on 9223-9232 — is `npm run tauri dev` running?');
}

const ws = await connect();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id !== 'req-1') {
    return;
  }
  if (message.success) {
    console.log(JSON.stringify(message.data, null, 2));
  } else {
    console.error(JSON.stringify(message, null, 2));
    process.exitCode = 1;
  }
  ws.close();
  process.exit(0);
});
ws.send(
  JSON.stringify({
    id: 'req-1',
    command: 'execute_js',
    args: { script, windowLabel: 'main' }
  })
);
setTimeout(() => {
  console.error('timeout waiting for the bridge');
  process.exit(1);
}, 20000);
```

- [ ] **Step 2: Write the shared probe helpers**

Create `scripts/probes/lib.js` (a plain script fragment, not a module):

```js
window.__t = (() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const prose = () => $('.prose');
  const scroller = () => $('.markdown-scroller') ?? prose().closest('.overflow-auto');
  const blocks = () => [...prose().querySelectorAll('.markdown-block')];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const textNodesIn = (element) => {
    const out = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) out.push(node);
    return out;
  };

  /** The whole raw document, read through Select All + copy. */
  const raw = async () => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'select_all' });
    await sleep(120);
    const dt = new DataTransfer();
    scroller().dispatchEvent(
      new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true })
    );
    window.getSelection()?.removeAllRanges();
    return dt.getData('text/plain');
  };

  /** Loads a document into the editor. */
  const load = async (markdown) => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {
      event: 'document_opened',
      payload: markdown
    });
    await sleep(400);
  };

  const key = (name) =>
    scroller().dispatchEvent(
      new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })
    );

  const caretRect = () => {
    const rect = document.querySelector('.markdown-caret')?.getBoundingClientRect();
    return rect ? { x: Math.round(rect.left), y: Math.round(rect.top) } : null;
  };

  /** Clicks a point inside an element, which is how the editor places carets. */
  const click = async (element, ratio = 0.99, dy = 0.5) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: rect.left + rect.width * ratio,
        clientY: rect.top + rect.height * dy
      })
    );
    await sleep(120);
  };

  const rectOf = (element) => {
    const rect = element.getBoundingClientRect();
    return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height) };
  };

  const styles = (selector) => {
    const element = prose().querySelector(selector);
    if (!element) return null;
    const style = getComputedStyle(element);
    return {
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      marginTop: style.marginTop,
      marginBottom: style.marginBottom,
      ...rectOf(element)
    };
  };

  /** Distances between the mounted blocks, in document order. */
  const gaps = () => {
    const rects = blocks().map((block) => block.getBoundingClientRect());
    return rects.slice(1).map((rect, index) => Math.round(rect.top - rects[index].bottom));
  };

  /** The empty-paragraph lines currently mounted. */
  const emptyLines = () =>
    blocks()
      .filter((block) => block.querySelector('.markdown-empty-line-placeholder'))
      .map((block) => ({ lineStart: Number(block.dataset.lineStart), ...rectOf(block) }));

  return {
    prose, scroller, blocks, textNodesIn, raw, load, key, click, caretRect,
    rectOf, styles, gaps, emptyLines, sleep
  };
})();
'helpers installed';
```

- [ ] **Step 3: Write the failing spacing probe**

Create `scripts/probes/spacing.js`:

```js
(async () => {
  const t = window.__t;
  await t.load('# Title\n\nfirst paragraph\n\nsecond paragraph\n\n## Section\n\nafter the heading\n');
  return {
    paragraphGap: t.gaps()[0],
    paragraph: t.styles('p'),
    h2: t.styles('h2')
  };
})()
```

- [ ] **Step 4: Run the probe and record today's numbers**

Run: `npm run tauri dev` (leave it running)
Run: `node scripts/tauri-probe.mjs scripts/probes/spacing.js`
Expected today: `paragraphGap: 16`, `paragraph.marginBottom: "8px"`, `h2.marginTop: "48px"` — the 64px of air the spec complains about (16 + 48).

- [ ] **Step 5: Move spacing from the block wrapper to the content**

In `src/styles.css`, add the tokens to the existing `.prose` rule:

```css
.prose {
  font-family: 'Crimson', serif;
  /* Positioning host for the locally-anchored caret. */
  position: relative;
  /* Print-like vertical rhythm: spacing comes from the content's own margins,
     which are already part of each block's measured height. */
  --md-space-paragraph: 0.5rem; /* 8px */
  --md-space-heading-before: 1.5rem; /* 24px */
  --md-space-heading-after: 0.5rem; /* 8px */
}
```

and replace the element rules next to it:

```css
/* Reduced vertical spacing for prose content (paragraphs and list items) */
.prose-tight p {
  margin-top: 0;
  margin-bottom: var(--md-space-paragraph);
}

.prose-tight h1 {
  margin-bottom: 0.75rem;
}

.prose-tight h2 {
  margin-top: var(--md-space-heading-before);
  margin-bottom: var(--md-space-heading-after);
}

.prose-tight h3,
.prose-tight h4,
.prose-tight h5,
.prose-tight h6 {
  margin-top: 1.25rem;
  margin-bottom: 0.375rem;
}

.prose-tight ul,
.prose-tight ol {
  margin-top: var(--md-space-paragraph);
  margin-bottom: var(--md-space-paragraph);
}

.prose-tight blockquote,
.prose-tight table,
.prose-tight pre {
  margin-top: 0.75rem;
  margin-bottom: 0.75rem;
}
```

and drop the generic gap so it cannot double-count:

```css
/* Blocks carry no margin of their own: the spacing belongs to the content and
   is measured as part of each block's height. */
.markdown-block + .markdown-block {
  margin-top: 0;
}
```

- [ ] **Step 6: Drop the duplicated gap in the renderer**

In `src/ui/markdown/virtual_block_renderer.ts`:

```ts
/**
 * Gap between block wrappers. Blocks have no margin of their own (styles.css
 * keeps the spacing inside the content, where each block height measures it),
 * so the renderer adds nothing; the arithmetic below stays as the single place
 * to change if spacing ever moves back to the wrappers.
 */
const BLOCK_GAP = 0;
```

- [ ] **Step 7: Run the probe and the type check**

Run: `node scripts/tauri-probe.mjs scripts/probes/spacing.js`
Expected: `paragraphGap: 8`, `h2.marginTop: "24px"`, `h2.marginBottom: "8px"`, `h1.marginBottom: "12px"`; paragraph to heading is 32px (8 + 24).

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 8: Ask the human to eyeball it**

Ask the human to look at the running window with the default document and `The Human Condition.md` and confirm the tighter rhythm reads like typeset prose. Adjust only the tokens in Step 5 if they want a different number.

- [ ] **Step 9: Commit**

```bash
git add scripts/tauri-probe.mjs scripts/probes/lib.js scripts/probes/spacing.js src/styles.css src/ui/markdown/virtual_block_renderer.ts
git commit -m "feat(editor): print-like compact block spacing, probe harness"
```

---

### Task 2: Blank-line runs become empty-paragraph blocks

**Files:**
- Create: `src/ui/markdown/blank_lines.ts`
- Create: `scripts/probes/empty-paragraphs.js`
- Modify: `src/ui/markdown/blocks.ts`
- Modify: `src/ui/markdown/state.ts`
- Modify: `src/ui/markdown/create_block.ts`
- Modify: `src/ui/markdown/position.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `isEmptyParagraphLine(line: string): boolean`.
- Produces: `emptyParagraphIndexes(blankLineCount: number, separator: boolean): number[]` — indexes within a blank run that become empty paragraphs.
- Produces: `BlockKind` includes `'blank'`; a blank block has `charStart === charEnd`, `text === ''`, `lineStart === lineEnd`.
- Produces: `state.firstEmptyParagraphAfter(offset: number): number | null`.

- [ ] **Step 1: Write the run rule**

Create `src/ui/markdown/blank_lines.ts`:

```ts
/**
 * Runs of blank lines and the empty paragraphs they carry.
 *
 * One blank line between two blocks is markdown's separator and renders as a
 * margin, not as a line. Every further blank line is something the author
 * added on purpose, so it renders as a real empty paragraph the caret can sit
 * on. At the top and the bottom of a file no separator is needed, so every
 * blank line there becomes an empty paragraph.
 */

/** Whether a raw line holds no content at all. */
export function isEmptyParagraphLine(line: string): boolean {
  return line.trim() === '';
}

/**
 * The indexes, inside a run of blank lines, that become empty paragraphs.
 * `separator` is true when the run sits between two blocks, in which case the
 * first blank line is the separator.
 */
export function emptyParagraphIndexes(blankLineCount: number, separator: boolean): number[] {
  const indexes: number[] = [];
  for (let index = separator ? 1 : 0; index < blankLineCount; index += 1) {
    indexes.push(index);
  }
  return indexes;
}
```

- [ ] **Step 2: Write the failing probe**

Create `scripts/probes/empty-paragraphs.js`:

```js
(async () => {
  const t = window.__t;
  const measure = async (markdown) => {
    await t.load(markdown);
    return {
      raw: await t.raw(),
      emptyLines: t.emptyLines().map((line) => line.height),
      blocks: t.blocks().length
    };
  };
  return {
    oneBlank: await measure('a\n\nb'),
    twoBlank: await measure('a\n\n\nb'),
    threeBlank: await measure('a\n\n\n\nb'),
    trailing: await measure('a\n\n'),
    leading: await measure('\n\na'),
    singleTrailingNewline: await measure('a\n'),
    looseList: await measure('- a\n\n- b')
  };
})()
```

- [ ] **Step 3: Run the probe to see it fail**

Run: `node scripts/tauri-probe.mjs scripts/probes/empty-paragraphs.js`
Expected: every case reports `emptyLines: []` — the placeholder class does not exist yet, so blank lines render as nothing.

- [ ] **Step 4: Add the `blank` block kind and the run rule to the splitter**

In `src/ui/markdown/blocks.ts`, extend the kind union:

```ts
export type BlockKind =
  | 'frontmatter'
  | 'fencedCode'
  | 'indentedCode'
  | 'displayMath'
  | 'html'
  | 'descriptionList'
  | 'paragraph'
  | 'blank';
```

add the import next to the mdast type import:

```ts
import { emptyParagraphIndexes, isEmptyParagraphLine } from './blank_lines';
```

and replace the blank-line skip at the top of the `splitBlocks` loop
(`if (first.text.trim() === '') { i += 1; continue; }`):

```ts
    if (isEmptyParagraphLine(first.text)) {
      const runStart = i;
      while (i < lines.length && isEmptyParagraphLine(lines[i].text)) {
        i += 1;
      }
      // The final line of a file that ends with a newline is that newline's
      // doing, not a blank line the author wrote.
      const phantom = i === lines.length && text.endsWith('\n') ? 1 : 0;
      const run = lines.slice(runStart, i - phantom);
      const separator = blocks.length > 0 && i < lines.length;
      for (const index of emptyParagraphIndexes(run.length, separator)) {
        const line = run[index];
        blocks.push({
          kind: 'blank',
          lineStart: line.number,
          lineEnd: line.number,
          charStart: line.start,
          charEnd: line.start,
          text: ''
        });
      }
      continue;
    }
```

- [ ] **Step 5: Make a run that holds an empty paragraph end a loose list**

In the loose-list merge inside `splitBlocks` (the `if (list) { ... }` branch), count the blanks and stop at a run that carries an empty paragraph:

```ts
      let scan = j;
      let mergedEnd = j;
      while (scan < lines.length) {
        const blankStart = scan;
        while (scan < lines.length && isEmptyParagraphLine(lines[scan].text)) {
          scan += 1;
        }
        const phantom = scan === lines.length && text.endsWith('\n') ? 1 : 0;
        // A run that renders an empty paragraph is a block boundary: the list
        // ends there and the empty paragraph becomes a block of its own.
        if (scan - blankStart - phantom > 1) {
          break;
        }
        if (scan >= lines.length) {
          break;
        }
        const info = listMarker(lines[scan].text);
        const sameLevel =
          info !== null && info.indent === list.indent && info.ordered === list.ordered;
        const indented = /^(?: {2,}|\t)/.test(lines[scan].text);
        if (!sameLevel && !indented) {
          break;
        }
        listMerged = true;
        while (scan < lines.length && !isEmptyParagraphLine(lines[scan].text)) {
          lineEnd = lines[scan].number;
          charEnd = lines[scan].end;
          scan += 1;
        }
        mergedEnd = scan;
      }
      if (listMerged) {
        j = mergedEnd;
      }
```

- [ ] **Step 6: Skip parsing for blank blocks and add the anchor lookup**

In `src/ui/markdown/state.ts`, guard `getBlockContent` and add the helper:

```ts
  /** The parsed children of a block (nothing to parse for a blank line). */
  getBlockContent(block: MarkdownBlock): RootContent[] {
    if (block.kind === 'blank') {
      return [];
    }
    const cached = this.blockContent.get(block.lineStart);
    if (cached) {
      return cached;
    }
    const content = parseMarkdown(blockParseInput(block)).children;
    this.blockContent.set(block.lineStart, content);
    return content;
  }

  /**
   * The start offset of the first empty paragraph at or after `offset`, or
   * null when the text has none. Commands use it to move the caret onto the
   * line an edit has just created.
   */
  firstEmptyParagraphAfter(offset: number): number | null {
    for (const block of this.blocks) {
      if (block.kind === 'blank' && block.charStart >= offset) {
        return block.charStart;
      }
    }
    return null;
  }
```

- [ ] **Step 7: Render the empty paragraph**

In `src/ui/markdown/create_block.ts`, route the kind in the constructor:

```ts
    this.element =
      node.kind === 'frontmatter'
        ? this.renderFrontmatter(node)
        : node.kind === 'blank'
          ? this.renderBlank(node)
          : this.renderParsed(node, children);
```

and add the renderer:

```ts
  /** A blank line the author added: an empty paragraph holding the caret. */
  private renderBlank(node: BlockNode): HTMLElement {
    const element = this.container(node);
    element.classList.add('markdown-blank');
    const paragraph = document.createElement('p');
    paragraph.className = 'markdown-node markdown-empty-line';
    const placeholder = document.createElement('span');
    placeholder.className = 'markdown-empty-line-placeholder markdown-node';
    // Block-relative: an empty paragraph starts at its own line start.
    placeholder.dataset.textFrom = '0';
    placeholder.textContent = '\u00a0';
    paragraph.appendChild(placeholder);
    element.appendChild(paragraph);
    return element;
  }
```

- [ ] **Step 8: Let the caret map onto that placeholder**

In `src/ui/markdown/position.ts`, widen the placeholder test inside `documentOffsetAt`:

```ts
        // A placeholder stands for a line with no characters: the caret can
        // sit anywhere inside it, and every position maps to the offset the
        // line's content would start at.
        const placeholder =
          textSpan.classList.contains('markdown-list-placeholder') ||
          textSpan.classList.contains('markdown-empty-line-placeholder');
```

- [ ] **Step 9: Give the line its height**

In `src/styles.css`:

```css
/* An empty paragraph is a line the caret can live on: one line box tall. */
.prose-tight p.markdown-empty-line {
  min-height: 1.5rem;
  margin-top: 0;
  margin-bottom: var(--md-space-paragraph);
}

.markdown-block.markdown-blank {
  contain-intrinsic-size: auto 32px;
}
```

- [ ] **Step 10: Run the probe and the type check**

Run: `node scripts/tauri-probe.mjs scripts/probes/empty-paragraphs.js`
Expected:

- `oneBlank.emptyLines: []` and `looseList.emptyLines: []` (one blank line is only a separator);
- `twoBlank.emptyLines: [32]`, `threeBlank.emptyLines: [32, 32]`;
- `trailing.emptyLines: [32]`, `singleTrailingNewline.emptyLines: []`;
- `leading.emptyLines: [32, 32]`;
- every `raw` equals the document that was loaded.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 11: Check the real documents are unchanged**

Create `scripts/probes/real-docs.js`:

```js
(async () => {
  const t = window.__t;
  const row = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
  const file = (prefix) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(prefix));
  const sidebar = () => {
    let node = row('Physics')?.parentElement;
    while (node && node.scrollHeight <= node.clientHeight) node = node.parentElement;
    return node;
  };
  const report = (name) => ({
    name,
    blocks: t.blocks().length,
    scrollHeight: Math.round(t.scroller().scrollHeight),
    emptyLines: t.emptyLines().length
  });

  const out = [];
  row('Physics')?.click();
  await t.sleep(600);
  row('Theoretic Mechanics')?.click();
  await t.sleep(600);
  file('Geometric and Kinematic')?.click();
  await t.sleep(1500);
  out.push(report('math document'));

  sidebar().scrollTop = sidebar().scrollHeight;
  await t.sleep(400);
  row('Western Philosophy')?.click();
  await t.sleep(700);
  row('Hannah Arendt')?.click();
  await t.sleep(700);
  file('The Human Condition')?.click();
  await t.sleep(2500);
  out.push(report('The Human Condition'));
  return out;
})()
```

Run: `node scripts/tauri-probe.mjs scripts/probes/real-docs.js`
Expected: both documents load, and `emptyLines: 0` for each — the corpus has only single blank-line runs. Record `blocks` and `scrollHeight` and compare them with Task 1's numbers (the big document measured 36967px before the spacing change; it should be smaller now, with the same block count).

- [ ] **Step 12: Commit**

```bash
git add src/ui/markdown/blank_lines.ts src/ui/markdown/blocks.ts src/ui/markdown/state.ts src/ui/markdown/create_block.ts src/ui/markdown/position.ts src/styles.css scripts/probes/empty-paragraphs.js
git commit -m "feat(editor): render extra blank lines as empty paragraphs"
```

---

### Task 3: Enter puts the caret on a real new line

**Files:**
- Modify: `src/ui/markdown/editing/context.ts`
- Create: `src/ui/markdown/editing/blank_lines.ts`
- Modify: `src/ui/markdown/editing/text_commands.ts`
- Create: `scripts/probes/enter.js`

**Interfaces:**
- Consumes: `state.firstEmptyParagraphAfter`, `blank` blocks, `blankItemLineAt` and `isRawRendered`.
- Produces: `type CaretTarget = number | ((state: MarkdownEditorState) => number)` and the widened `applyEdit(context, from, to, replacement, caret?)`.
- Produces: `paragraphBreak(text: string, offset: number): string`, `emptyLineInsertion(text: string, offset: number, inserted: string): string`, `startEmptyParagraph(context, block, offsets): boolean`, `splitParagraph(context, offsets): boolean`, `exitBlankItem(context, line): boolean`.

- [ ] **Step 1: Let a command derive the caret from the text after the edit**

In `src/ui/markdown/editing/context.ts`:

```ts
/** Where the caret goes after an edit: an offset, or one the new text decides. */
export type CaretTarget = number | ((state: MarkdownEditorState) => number);

/**
 * Applies a raw-text edit, re-syncs the rendered window and moves the caret.
 * Every command funnels through here so the change/render/caret sequence is
 * identical everywhere.
 */
export function applyEdit(
  context: EditorContext,
  from: number,
  to: number,
  replacement: string,
  caret: CaretTarget = from + replacement.length
): void {
  context.state.replaceRange(from, to, replacement);
  context.renderer.renderChanged();
  restoreCaret(context, typeof caret === 'function' ? caret(context.state) : caret);
}
```

- [ ] **Step 2: Write the failing probe**

Create `scripts/probes/enter.js`:

```js
(async () => {
  const t = window.__t;

  /** Puts the caret inside the text node holding `needle`. */
  const caretAt = async (needle, inside = needle.length) => {
    const block = t.blocks().find((b) => b.textContent.includes(needle));
    const node = t.textNodesIn(block).find((n) => n.data.includes(needle));
    const index = node.data.indexOf(needle) + inside;
    const range = document.createRange();
    range.setStart(node, index);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: rect.left,
        clientY: rect.top + rect.height / 2
      })
    );
    await t.sleep(120);
    return Math.round(rect.top);
  };

  const run = async (markdown, needle, inside) => {
    await t.load(markdown);
    const before = await t.raw();
    const targetY = await caretAt(needle, inside);
    t.key('Enter');
    await t.sleep(200);
    return {
      before,
      after: await t.raw(),
      caret: t.caretRect(),
      targetY,
      emptyLines: t.emptyLines().map((line) => line.top)
    };
  };

  return {
    endOfMiddleParagraph: await run('first line\n\nsecond line\n', 'first line'),
    endOfLastParagraph: await run('only line\n', 'only line'),
    midParagraph: await run('alpha beta\n', 'alpha ', 5),
    blankItem: await run('- a\n- \n- b\n', '- a')
  };
})()
```

- [ ] **Step 3: Run the probe to see it fail**

Run: `node scripts/tauri-probe.mjs scripts/probes/enter.js`
Expected today: `endOfMiddleParagraph.after` gains two newlines, `emptyLines` is empty, and the caret stays at `targetY` — the author cannot type on the new line.

- [ ] **Step 4: Write the Enter rules**

Create `src/ui/markdown/editing/blank_lines.ts`:

```ts
/**
 * Line-level editing rules for empty lines.
 *
 * `Enter` at the end of a block only adds the newline the author asked for:
 * one, which makes the blank run after the block long enough to hold an empty
 * paragraph. Typing on an empty line needs one newline on the side where the
 * next block begins, because markdown keeps two paragraphs apart only when a
 * blank line sits on both sides.
 */

import { isRawRendered, type MarkdownBlock } from '../blocks';
import { applyEdit, type EditorContext } from './context';

/** The newlines `Enter` inserts to make a paragraph break at `offset`. */
export function paragraphBreak(text: string, offset: number): string {
  const following = /^\n+/.exec(text.slice(offset))?.[0].length ?? 0;
  return '\n'.repeat(Math.max(0, 2 - following));
}

/** The insert that turns the empty line at `offset` into a paragraph. */
export function emptyLineInsertion(text: string, offset: number, inserted: string): string {
  const lineEnd = text.indexOf('\n', offset);
  const followedByBlock = text.slice(lineEnd < 0 ? text.length : lineEnd + 1).trim() !== '';
  return followedByBlock ? `${inserted}\n` : inserted;
}

/** `Enter` at the end of a block: add a line and move the caret onto it. */
export function startEmptyParagraph(
  context: EditorContext,
  block: MarkdownBlock,
  offsets: { from: number; to: number }
): boolean {
  applyEdit(context, offsets.from, offsets.to, '\n', (state) => {
    return state.firstEmptyParagraphAfter(block.charEnd) ?? block.charEnd;
  });
  return true;
}

/** `Enter` inside a block: split it into two paragraphs. */
export function splitParagraph(
  context: EditorContext,
  offsets: { from: number; to: number }
): boolean {
  const breakText = paragraphBreak(context.state.getText(), offsets.from);
  applyEdit(context, offsets.from, offsets.to, breakText, offsets.from + 2);
  return true;
}
```

- [ ] **Step 5: Add the blank-item rule to the same module**

```ts
/**
 * `Enter` on a blank list item: the item's marker goes, and an empty paragraph
 * takes its place, which also ends the list there (a run that carries an empty
 * paragraph is a block boundary).
 */
export function exitBlankItem(
  context: EditorContext,
  line: { start: number; end: number }
): boolean {
  const text = context.state.getText();
  const cleared = `${text.slice(0, line.start)}${text.slice(line.end)}`;
  const runFrom = blankRunStart(cleared, line.start);
  const runTo = blankRunEnd(cleared, line.start);
  const betweenBlocks = cleared.slice(0, runFrom).trim() !== '' && cleared.slice(runTo).trim() !== '';
  // One blank line is a separator; a second one is the paragraph the author
  // asked for.
  const replacement = betweenBlocks ? '\n' : '';
  applyEdit(context, line.start, line.end, replacement, (state) => {
    return state.firstEmptyParagraphAfter(line.start) ?? line.start;
  });
  return true;
}

/** The start of the blank run the line at `offset` belongs to. */
function blankRunStart(text: string, offset: number): number {
  let start = offset;
  while (start > 0) {
    const previousBreak = text.lastIndexOf('\n', start - 2);
    if (previousBreak < 0 || text.slice(previousBreak + 1, start - 1).trim() !== '') {
      break;
    }
    start = previousBreak + 1;
  }
  return start;
}

/** The end of the blank run the line at `offset` belongs to. */
function blankRunEnd(text: string, offset: number): number {
  let end = offset;
  while (end < text.length) {
    const nextBreak = text.indexOf('\n', end);
    if (nextBreak < 0) {
      break;
    }
    if (text.slice(end, nextBreak).trim() !== '') {
      break;
    }
    end = nextBreak + 1;
  }
  return end;
}
```

`blankRunStart`/`blankRunEnd` read the *cleared* text, which is why `exitBlankItem` builds `cleared` first.

- [ ] **Step 6: Route Enter through the rules**

In `src/ui/markdown/editing/text_commands.ts`, replace `insertNewline` and delete the now-unused `lineBreakFor` helper:

```ts
/** Splits the current line, following the rule for each kind of block. */
export function insertNewline(context: EditorContext): boolean {
  const range = editorSelection(context, true);
  if (!range) {
    return false;
  }
  const offsets = rangeOffsets(context, range);
  if (!offsets) {
    return false;
  }
  const block = context.state.getBlockAtOffset(offsets.from);
  if (!block) {
    return false;
  }
  // Code, math and other raw-rendered blocks keep their own line structure.
  if (isRawRendered(block.kind) || block.kind === 'displayMath') {
    applyEdit(context, offsets.from, offsets.to, '\n');
    return true;
  }
  // An empty paragraph splits in two: the author asked for another line.
  if (block.kind === 'blank') {
    applyEdit(context, offsets.from, offsets.to, '\n');
    return true;
  }
  const item = blankItemLineAt(context.state.getText(), offsets.from);
  if (item) {
    return exitBlankItem(context, item);
  }
  if (offsets.from >= block.charEnd) {
    return startEmptyParagraph(context, block, offsets);
  }
  return splitParagraph(context, offsets);
}
```

with the imports `import { isRawRendered } from '../blocks';`, `import { blankItemLineAt } from '../list_lines';` and the new rule functions.

- [ ] **Step 7: Run the probe and the type check**

Run: `node scripts/tauri-probe.mjs scripts/probes/enter.js`
Expected:

- `endOfMiddleParagraph`: one newline added, `after === 'first line\n\n\nsecond line\n'`, one empty line whose top is about 24px below `targetY`, caret on it;
- `endOfLastParagraph`: `after === 'only line\n\n'`, caret on the new line;
- `midParagraph`: `after === 'alpha\n\n beta\n'`, caret at the start of the text after the break;
- `blankItem`: marker gone, one empty line where the item was, caret on it, and the raw between the two lists holds two newlines.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/ui/markdown/editing/blank_lines.ts src/ui/markdown/editing/context.ts src/ui/markdown/editing/text_commands.ts scripts/probes/enter.js
git commit -m "feat(editor): Enter starts a real new paragraph line"
```

---

### Task 4: Typing into an empty paragraph, and deleting one

**Files:**
- Modify: `src/ui/markdown/editing/blank_lines.ts`
- Create: `src/ui/markdown/editing/line_removal.ts`
- Modify: `src/ui/markdown/editing/blank_item.ts`
- Modify: `src/ui/markdown/editing/text_commands.ts`
- Modify: `src/ui/markdown/editing/clipboard.ts`
- Modify: `src/ui/markdown/list_lines.ts`
- Create: `scripts/probes/empty-line-editing.js`

**Interfaces:**
- Produces: `materializeInsertion(context, offsets, inserted): boolean`.
- Produces: `deleteEmptyParagraph(context, offset): boolean`.
- Produces: `lineRemoval(text, line): { from: number; to: number; caret: number }` in `editing/line_removal.ts`.
- Produces: `lineSpanAt(text, offset): { start: number; end: number }` exported from `list_lines.ts`.

- [ ] **Step 1: Write the failing probe**

Create `scripts/probes/empty-line-editing.js`:

```js
(async () => {
  const t = window.__t;
  const emptyLineBlock = () => {
    const point = t.emptyLines()[0];
    return t.blocks().find((b) => Number(b.dataset.lineStart) === point.lineStart);
  };
  const tops = () => t.blocks().map((b) => Math.round(b.getBoundingClientRect().top));

  const typeOnEmpty = async (markdown) => {
    await t.load(markdown);
    const before = tops();
    await t.click(emptyLineBlock().querySelector('.markdown-empty-line-placeholder'));
    t.key('x');
    await t.sleep(250);
    return { raw: await t.raw(), before, after: tops().slice(0, before.length) };
  };

  const deleteLine = async (markdown) => {
    await t.load(markdown);
    await t.click(emptyLineBlock().querySelector('.markdown-empty-line-placeholder'));
    t.key('Backspace');
    await t.sleep(250);
    return { raw: await t.raw(), emptyLines: t.emptyLines().length };
  };

  return {
    typeInMiddle: await typeOnEmpty('a\n\n\nb'),
    typeAtEnd: await typeOnEmpty('a\n\n'),
    deleteMiddleLine: await deleteLine('a\n\n\nb'),
    deleteTrailingLine: await deleteLine('a\n\n')
  };
})()
```

- [ ] **Step 2: Run the probe to see it fail**

Run: `node scripts/tauri-probe.mjs scripts/probes/empty-line-editing.js`
Expected: `typeInMiddle.raw === 'ax\n\nb'` or similar — typing on an empty line currently either joins the neighbouring paragraph or lands elsewhere, and deleting removes a character instead of the line.

- [ ] **Step 3: Export the line span helper**

In `src/ui/markdown/list_lines.ts`, make `lineSpanAt` public:

```ts
/** The bounds of the line an offset sits on. */
export function lineSpanAt(text: string, offset: number): { start: number; end: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const lineBreak = text.indexOf('\n', clamped);
  return {
    start: text.lastIndexOf('\n', clamped - 1) + 1,
    end: lineBreak < 0 ? text.length : lineBreak
  };
}
```

- [ ] **Step 4: Extract the shared line removal**

Create `src/ui/markdown/editing/line_removal.ts` with the body moved out of `blank_item.ts`:

```ts
/**
 * Removing a whole line from the raw text.
 *
 * The line leaves with the newline before it, so the lines above and below it
 * join where it was and the caret takes that place — the end of the line
 * above. The first line of the file has no newline before it, so it takes the
 * one after instead.
 */
export function lineRemoval(
  text: string,
  line: { start: number; end: number }
): { from: number; to: number; caret: number } {
  if (line.start > 0) {
    return { from: line.start - 1, to: line.end, caret: line.start - 1 };
  }
  return { from: line.start, to: Math.min(text.length, line.end + 1), caret: line.start };
}
```

In `src/ui/markdown/editing/blank_item.ts`, delete the private `lineRemoval` and import the shared one.

- [ ] **Step 5: Add the typing and deleting rules**

In `src/ui/markdown/editing/blank_lines.ts`:

```ts
import { isEmptyParagraphLine } from '../blank_lines';
import { lineSpanAt } from '../list_lines';
import { lineRemoval } from './line_removal';

/** Typing (or pasting) on an empty paragraph: the text needs its own line. */
export function materializeInsertion(
  context: EditorContext,
  offsets: { from: number; to: number },
  inserted: string
): boolean {
  const replacement = emptyLineInsertion(context.state.getText(), offsets.from, inserted);
  applyEdit(context, offsets.from, offsets.to, replacement, offsets.from + inserted.length);
  return true;
}

/** Backspace/Delete on an empty paragraph: the line goes, like a blank item. */
export function deleteEmptyParagraph(context: EditorContext, offset: number): boolean {
  const text = context.state.getText();
  const line = lineSpanAt(text, offset);
  if (!isEmptyParagraphLine(text.slice(line.start, line.end))) {
    return false;
  }
  const removal = lineRemoval(text, line);
  applyEdit(context, removal.from, removal.to, '', removal.caret);
  return true;
}
```

- [ ] **Step 6: Route typing, pasting and deleting through the rules**

In `src/ui/markdown/editing/text_commands.ts`, `insertText` before its generic edit:

```ts
  const block = context.state.getBlockAtOffset(offsets.from);
  if (block?.kind === 'blank' && offsets.from === offsets.to) {
    return materializeInsertion(context, offsets, text);
  }
```

and in `deleteText`, beside the blank-item check:

```ts
    if (deleteBlankItem(context, from)) {
      return true;
    }
    if (deleteEmptyParagraph(context, from)) {
      return true;
    }
```

In `src/ui/markdown/editing/clipboard.ts`, the same guard in `pasteText`, before `applyEdit`:

```ts
  const block = context.state.getBlockAtOffset(offsets.from);
  if (block?.kind === 'blank' && offsets.from === offsets.to) {
    event.preventDefault();
    materializeInsertion(context, offsets, replacement);
    return;
  }
```

- [ ] **Step 7: Run the probe and the type check**

Run: `node scripts/tauri-probe.mjs scripts/probes/empty-line-editing.js`
Expected:

- `typeInMiddle.raw === 'a\n\nx\n\nb'` and `before` equals `after` (the line already occupied its height, so nothing moves);
- `typeAtEnd.raw === 'a\n\nx'`;
- `deleteMiddleLine.raw === 'a\n\nb'` with `emptyLines: 0`;
- `deleteTrailingLine.raw === 'a\n'` with `emptyLines: 0`.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/ui/markdown/editing/blank_lines.ts src/ui/markdown/editing/line_removal.ts src/ui/markdown/editing/blank_item.ts src/ui/markdown/editing/text_commands.ts src/ui/markdown/editing/clipboard.ts src/ui/markdown/list_lines.ts scripts/probes/empty-line-editing.js
git commit -m "feat(editor): type into and delete empty paragraphs"
```

---

### Task 5: Pointing at lines — margins and the space below the text

**Files:**
- Create: `src/ui/markdown/editing/pointer.ts`
- Modify: `src/ui/markdown/markdown_editor.ts`
- Modify: `src/ui/markdown/caret/caret.ts`
- Create: `scripts/probes/pointer.js`

**Interfaces:**
- Produces: `placeCaretFromPointer(context: EditorContext, clientY: number): boolean`.
- Produces: the editor's scroller element carries the class `markdown-scroller`.

- [ ] **Step 1: Write the failing probe**

Create `scripts/probes/pointer.js`:

```js
(async () => {
  const t = window.__t;
  await t.load('# Title\n\nfirst line\n\nsecond line\n');
  const first = t.blocks().find((b) => b.textContent.includes('first line')).getBoundingClientRect();
  const second = t.blocks().find((b) => b.textContent.includes('second line')).getBoundingClientRect();
  const clickAt = async (y) => {
    t.scroller().dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: first.left + 10, clientY: y })
    );
    await t.sleep(150);
    return t.caretRect();
  };
  return {
    firstBottom: Math.round(first.bottom),
    secondTop: Math.round(second.top),
    inTopOfMargin: await clickAt(first.bottom + 2),
    inBottomOfMargin: await clickAt(second.top - 2),
    belowText: await clickAt(second.bottom + 40)
  };
})()
```

- [ ] **Step 2: Run the probe to see it fail**

Run: `node scripts/tauri-probe.mjs scripts/probes/pointer.js`
Expected today: all three clicks return `null` — this is the dead zone where the caret is cleared.

- [ ] **Step 3: Write the pointer rules**

Create `src/ui/markdown/editing/pointer.ts`:

```ts
/**
 * Turning a pointer position into a caret.
 *
 * Clicks that land on a markdown node are handled by the node itself, which
 * maps the pointer through the rendered text. Clicks that land on the margin
 * between two blocks, or on the space below the last line, have no node to map
 * through: they go to the nearest line edge, which is the line the reader is
 * pointing at.
 */

import { proseRoot, restoreCaret, type EditorContext } from './context';

/** Places the caret at the line edge nearest to a pointer position. */
export function placeCaretFromPointer(context: EditorContext, clientY: number): boolean {
  const root = proseRoot(context);
  if (!root) {
    return false;
  }
  let nearest: { offset: number; distance: number } | null = null;
  for (const element of root.querySelectorAll<HTMLElement>('.markdown-block')) {
    const block = context.state.getBlockAtLine(Number(element.dataset.lineStart));
    if (!block) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    const candidates = [
      { offset: block.charStart, distance: Math.abs(clientY - rect.top) },
      { offset: block.charEnd, distance: Math.abs(clientY - rect.bottom) }
    ];
    for (const candidate of candidates) {
      if (!nearest || candidate.distance < nearest.distance) {
        nearest = candidate;
      }
    }
  }
  return nearest ? restoreCaret(context, nearest.offset) : false;
}
```

- [ ] **Step 4: Wire it up and stop clearing the caret inside the editor**

In `src/ui/markdown/markdown_editor.ts`, name the scroller and handle misses:

```ts
    this.contentView.className = 'markdown-scroller flex-1 min-h-0 overflow-auto p-4';
```

```ts
    // Clicks that miss every markdown node still place the caret: the margin
    // between blocks and the space below the text are lines, not dead zones.
    this.contentView.addEventListener('click', (event) => this.handlePointerClick(event));
```

```ts
  /** Places the caret for a click that no markdown node handled. */
  private handlePointerClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest('.markdown-node')) {
      return;
    }
    placeCaretFromPointer(this.context, event.clientY);
  }
```

In `src/ui/markdown/caret/caret.ts`, keep the caret for clicks inside the editor:

```ts
  // Clicking outside the editable document clears the caret; clicks inside it
  // are resolved to a line edge by the editor.
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('.markdown-scroller')) {
      return;
    }
    hideCaret();
  });
```

- [ ] **Step 5: Run the probe and the type check**

Run: `node scripts/tauri-probe.mjs scripts/probes/pointer.js`
Expected: `inTopOfMargin` returns a caret at the end of the first line (same `y` as `firstBottom` minus the line height), `inBottomOfMargin` returns a caret at the start of the second line, `belowText` returns a caret at the end of the document — none of them `null`.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/ui/markdown/editing/pointer.ts src/ui/markdown/markdown_editor.ts src/ui/markdown/caret/caret.ts scripts/probes/pointer.js
git commit -m "feat(editor): margin clicks place the caret"
```

---

### Task 6: Regression sweep across the editor

**Files:**
- Create: `scripts/probes/regression.js`
- Modify: any file the sweep proves wrong

**Interfaces:**
- Consumes every rule from Tasks 1–5.

- [ ] **Step 1: Write the sweep**

Create `scripts/probes/regression.js`:

```js
(async () => {
  const t = window.__t;
  const results = {};
  const emit = async (name) => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: name });
    await t.sleep(200);
  };

  // A blank list item still deletes only its own line.
  await t.load('- a\n- \n- b\n');
  const item = t.blocks().find((b) => b.textContent.includes('a'));
  await t.click(item.querySelector('.markdown-list-placeholder').closest('li'));
  t.key('Backspace');
  t.key('x');
  results.blankItemDeleteAndType = await t.raw();

  // Task list checkboxes still rewrite the marker.
  await t.load('- [ ] task one\n- [ ] task two\n');
  t.prose()
    .querySelectorAll('input[type="checkbox"]')[0]
    .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await t.sleep(200);
  results.taskToggle = await t.raw();

  // Typing on an empty paragraph, then undo and redo.
  await t.load('a\n\n\nb\n');
  const point = t.emptyLines()[0];
  const lineBlock = t.blocks().find((b) => Number(b.dataset.lineStart) === point.lineStart);
  await t.click(lineBlock.querySelector('.markdown-empty-line-placeholder'));
  t.key('x');
  await t.sleep(200);
  results.typed = await t.raw();
  await emit('undo');
  results.undone = await t.raw();
  await emit('redo');
  results.redone = await t.raw();

  // Select All still round-trips the raw source.
  await t.load('# H\n\ntext\n');
  results.copyRoundTrip = await t.raw();

  // Arrows stop on the empty paragraph between two paragraphs.
  await t.load('a\n\n\nb\n');
  await t.click(t.blocks().find((b) => b.textContent === 'a'));
  t.key('ArrowDown');
  await t.sleep(150);
  const onEmptyLine = t.caretRect();
  t.key('ArrowDown');
  await t.sleep(150);
  results.arrows = {
    emptyLineTop: t.emptyLines()[0].top,
    onEmptyLine,
    afterSecondDown: t.caretRect()
  };

  return results;
})()
```

- [ ] **Step 2: Run the sweep**

Run: `node scripts/tauri-probe.mjs scripts/probes/regression.js`
Expected:

- `blankItemDeleteAndType === '- a\nx\n- b'` (the item's line was replaced, the caret took the place it had);
- `taskToggle === '- [x] task one\n- [ ] task two'`;
- `typed === 'a\n\nx\n\nb\n'`, `undone === 'a\n\n\nb\n'`, `redone === 'a\n\nx\n\nb\n'`;
- `copyRoundTrip === '# H\n\ntext'`;
- `arrows.onEmptyLine.y` equals `arrows.emptyLineTop` (within a pixel or two) and `arrows.afterSecondDown.y` is one line below it — arrows visit empty paragraphs but not separators.

- [ ] **Step 3: Ask the human to exercise it**

Ask the human to check, in the running app: `Enter` at the end of the last paragraph, `Enter` on an empty list item, typing on the new line, `Backspace` on it, clicking a margin, and both real documents (`The Human Condition.md`, `Geometric and Kinematic Foundations of Lagrangian Mechanics.md`). Record anything they report in the commit message, and fix it before committing.

- [ ] **Step 4: Run every probe and the type check**

Run (with the app running):

```bash
npx tsc --noEmit
for probe in scripts/probes/spacing.js scripts/probes/empty-paragraphs.js scripts/probes/enter.js scripts/probes/empty-line-editing.js scripts/probes/pointer.js scripts/probes/regression.js; do
  echo "--- $probe"
  node scripts/tauri-probe.mjs "$probe"
done
```

Expected: no type errors and every probe reports the values listed in its task.

- [ ] **Step 5: Update the spec if reality diverged**

If a rule had to change while implementing it, edit
`docs/superpowers/specs/2026-09-14-blank-lines-and-compact-spacing-design.md` so it describes what the code actually does, and commit it with the sweep.

- [ ] **Step 6: Commit**

```bash
git add scripts/probes/regression.js docs/superpowers/specs/2026-09-14-blank-lines-and-compact-spacing-design.md
git commit -m "test(editor): regression sweep for blank-line editing"
```

---

## Notes for the executor

- The app must be running before any probe: `npm run tauri dev`. The bridge listens on port 9223; the harness tries 9223–9232.
- A probe that times out may still be running in the page (the bridge gives up after 20s while the script keeps going). Keep probes short: one document load per probe, small sleeps, and re-read `t.blocks()` after every edit instead of holding element references.
- If results look stale after several probes, reload the page (`location.reload()` through the bridge) and run the probe again.
- `npx tsc --noEmit` is the only automated gate the repo has; the probes are the behavioural tests, and they live in the repo so they can be re-run after any later change.
