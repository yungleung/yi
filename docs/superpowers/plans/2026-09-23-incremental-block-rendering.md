# Incremental Block Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an edit rebuilds the nodes it changed inside a block, not the whole
block — typing in a long paragraph must not re-create its citations, links and
emphasis to move one text node.

**Architecture:** the renderer keeps, for a mounted block, the pair of (parsed
children, elements) it built, and an edit that changes one child patches that
child in place, recursively, keeping every element whose own source is unchanged.
A block is rebuilt whole only when it is mounted for the first time, when its kind
changed, or when it renders one thing of its own rather than a list of children (a
display formula showing its text, a blank line, a frontmatter block). The parse
stays per block: this phase is about the DOM, not the parser.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** this document's part 1. The design document
(`docs/superpowers/specs/2026-09-21-markdown-editor-architecture-design.md`) states
the invariant this phase serves — a block's rendering is a pure function of its own
source — and stops there, as it did for P5 and P6.

## Global Constraints

- **Behaviour is preserved.** The same edits produce the same text, the same
  blocks, the same rendered content, the same caret offset and the same rendered
  window. What changes is *how* the DOM is produced: elements whose node source is
  unchanged are reused instead of re-created.
- **The offsets do not move.** `getText()`, `getBlocks()`, `getBlockAtOffset`,
  `getBlockAtLine`, `getBlockContent`, `historyEdits()`, `undo`, `redo`, `loadText`
  keep their signatures and their meaning.
- **No visible layout change.** Chunking a block for the purpose of unmounting part
  of it is out of scope and stays out (see `1.4`): this phase never changes where a
  line breaks, how two elements sit relative to each other, or the page's height.
- `npx tsc --noEmit` and `npm run check` stay green, and the check count grows;
  `npm run probe:all` stays green, with the probe count growing by two.
- Commit style: `refactor(render): …`, `refactor(document): …`, `test(…): …`,
  `docs: …`.

---

## Part 1 — the design

### 1.1 The measurement this phase answers to

Four throwaway probes, run against the 323 KB fixture note on a freshly started
app, measuring the same functions the app itself calls on the block a keystroke
lands in (its last block: a paragraph of 4741 characters, 41 source lines,
**189 elements**; the document: 314 266 characters, 1054 lines, 484 blocks):

| What was measured | Time |
| --- | --- |
| that block's parse (`new MarkdownEditorState(text)` + `getBlockContent`) | ~10 ms |
| building its DOM, detached (`createBlockComponent`) | ~1 ms |
| rebuilding it and forcing layout (`replaceWith` + `getBoundingClientRect`) | **~40 ms** |
| patching one text node inside it and forcing layout | **~0 ms** |

and the app's own keystroke at the end of that note, with the geometry reads the
path makes counted and timed:

| Per keystroke | Value |
| --- | --- |
| median edit time (`edit-cost.js`) | 36–38 ms |
| `getBoundingClientRect` calls, and the time in them | 2, ~24.5 ms |
| `offsetHeight` reads, and the time in them | 1, ~24.5 ms |
| whole-document split / split from the edit | ~1 ms / ~0 ms |

Three things follow, and they are what the phase is built on:

1. The *text* and the *split* are not the cost (consistent with P6's own A/B: with
   `splitBlocks` put back, the median was 37 ms against 36 ms).
2. Building a block's DOM is cheap (~1 ms); **replacing it in the page is not**
   (~40 ms) — it invalidates the layout of everything in and below it, and the next
   geometry read pays for that.
3. So the repair is to stop replacing the block: keep its elements and move only
   what the edit changed.

### 1.2 What "the same node" means

A block's parse is already cached and keyed by the block's own source
(`state.getBlockContent`, P0). This phase adds the same idea one level down: each
node inside the block is keyed by *its* own source slice, so a node the edit did not
touch keeps the element it already had.

The slice is available and exact: `getBlockContent` parses
`blockParseInput(block)` — the block's text with dropped trailing spaces made
visible, which `trailing_spaces.ts` documents as length preserving — so a node's
`position.start.offset`/`end.offset` index the prepared text, and a node's source
is `prepared.slice(start, end)`. Two nodes are the same node when their `type` and
their source are equal — the same statement `blockContentKey` makes about a block,
one level down — and when the shape they are built in is the same, because a node
whose own source is the one being shown (`source_mode.ts: isShownSource`) is a
different element: a link with the caret inside it is the markdown, not its title.
That is a per-node fact, so an inline source change patches the one node instead of
the block (a *block* that shows its own text — a display formula — has no children
to patch and is still built again).

The *old* sources cannot be read back out of the DOM — the text they were sliced
from is the text the edit replaced — so the renderer has to remember what it built:
for every container element, the records of the children it made
(`{ node, source, shape, element }`, `element` null when the node type has no
component, as `imageReference` and `definition` do not). The records are filled in
once, right after a block element is built, and updated by every patch. Pairing the
freshly built DOM with the parse it came from needs one fact the DOM does not carry
— which node an element was built for — so every node element is tagged with its own
range when it is created (one place: the base component's constructor).

### 1.3 The patch

Two halves, split by what they need to know:

- **Which children to reuse** is a pure decision and lives in
  `document/block_children.ts`: `reusePlan(previous, next)` maps each of the new
  children to the index of the old child whose element it can have, or -1 to build
  it. It matches by type and source, in order, and each old child is handed out at
  most once. Node can drive it, so it gets a check.
- **Applying the plan** needs the DOM and lives in `render_patch.ts`: for a
  container and its new children, it looks the container's records up, keeps the
  elements whose nodes came back unchanged, rebuilds the ones that did not
  (recursing into containers, since a paragraph's own children are usually where the
  change is), removes the ones that are gone, puts the kept ones back in document
  order, and records what the container holds now. Its two entry points are
  `rememberChildren(element, children, prepared)` — for a block that was just built
  — and `patchBlock(element, block, children)` — for one whose content changed.

The renderer's per-edit path (`virtual_block_renderer.ts: renderChanged`) currently
drops a mounted block whose `renderKey` changed — which is every edit inside it —
and re-creates it in `syncWindow`. The new rule: when the key changed but the
block is one whose rendering is a list of children — the same kind as before, not a
source block like a display formula, not a blank line or a frontmatter block — patch
the element in place and re-remember it under the new key; otherwise drop it, as
today. The block element itself, its tags, the caret hooks (`capture`/`restore`),
the height measurement and the spacer arithmetic are all unchanged — a patch ends
where the existing `renderBlock` ends: re-tag, re-measure, restore the caret.

### 1.4 Not this phase, and why

**Unmounting part of a block ("virtualising inside a block").** Examined and
dropped. A block is one unit of layout: a paragraph's text is line boxes, so
rendering half of it and standing in for the rest with a spacer changes where lines
break; a list's items live inside one `<ul>`, which has no valid child that can hold
the space of the items it is missing; and a table's rows are inside one `<table>`.
The measurement above also removes the motive: building the DOM is ~1 ms, and what
costs is replacing it, which patching removes without touching layout.

**Lazy block offsets through a line index** (the follow-on P6 recorded as next).
Examined and deferred, with the reason written down here so it is not "forgotten":
making `charStart`/`charEnd` lazy is not enough on its own, because an edit that adds
a line shifts every block's *line numbers* too, and the line number is what the
renderer keys mounted elements by, what the caret tags carry and what
`getBlockAtLine` answers. Real laziness therefore needs stable line handles — a line
store blocks point into — and that changes what a `MarkdownBlock` is everywhere.
Against that, the measured prize is ~1 ms per keystroke (the split) plus ~1 ms of
block rewriting, which is inside this probe's noise. It is a phase worth doing when
there is a reason to change the block model, not before.

**The parse.** ~10 ms per keystroke of the 36–38 ms, and the largest single term
left after this phase. It stays: the parse is per block, keyed by the block's source,
and a keystroke changes that source. Making it incremental is a parser phase, and it
is worth re-measuring after this one.

---

## Part 2 — what the renderer has today

| Thing | Where | Note |
| --- | --- | --- |
| What to mount, and the spacers | `viewport_window.ts` | whole blocks, by height |
| Heights, keyed by rendering identity | `block_sizes.ts` | content-keyed, survives an edit above |
| A block's element | `create_block.ts` | container + `appendChildren` of the parsed children |
| Node elements | `nodes/*`, `registry.ts: appendChildren` | one component per mdast node |
| Per-edit re-sync | `virtual_block_renderer.ts: renderChanged` | drops blocks whose render key changed |
| One block rebuilt in place | `virtual_block_renderer.ts: renderBlock` | used by the formatting commands |
| Caret across a swap | `markdown_editor.ts: setSyncHooks` | `capture`/`restore`, by offset |
| The block's parse | `document/state.ts: getBlockContent` | keyed by `blockContentKey` |

---

## Part 3 — tasks

### Task 1: The cost of rebuilding a block, as a probe

**Files:**
- Create: `test/probes/block-rebuild-cost.js`
- Modify: `test/README.md` (the probe count)

**Interfaces:**

- Consumes: `document/state.ts` (`MarkdownEditorState`), `document/blocks.ts`
  (`splitBlocks`), `create_block.ts` (`createBlockComponent`), through the probe
  helper `t.app(path)`.
- Produces: nothing; this is the phase's evidence, and the number Task 3's probe
  and the acceptance run are read against.

- [ ] **Step 1: Write the probe**

The probe measures on the document it is given: the block a keystroke would land in
(the last one), its parse, its detached DOM build, rebuilding it and forcing layout,
patching one of its text nodes and forcing layout, and the app's own per-keystroke
time with the geometry reads counted. It reports before it finishes, so a bridge
timeout still yields the numbers.

```js
/**
 * What rebuilding the block a keystroke lands in costs, against patching the text
 * node that keystroke changed.
 *
 * The pair of numbers is the phase's reason: building a block's DOM is cheap,
 * replacing it in the page is not, and the layout that replacement invalidates is
 * what the next geometry read pays for. Runs against the document the runner was
 * given — the 323 KB fixture note under `probe:all`, the demo document by name.
 *
 * @covers src/ui/markdown/virtual_block_renderer.ts, src/ui/markdown/create_block.ts
 * @needs-large-document — run against the 323 KB fixture note.
 *
 * Run with:
 *   npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" \
 *     test/probes/block-rebuild-cost.js
 */
(async () => {
  const t = window.__t;
  const { MarkdownEditorState } = await t.app('/src/ui/markdown/document/state.ts');
  const { splitBlocks } = await t.app('/src/ui/markdown/document/blocks.ts');
  const { createBlockComponent } = await t.app('/src/ui/markdown/create_block.ts');
  const out = t.report({});
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const round = (value) => Math.round(value * 100) / 100;

  // The app's own keystroke first, because reading the document is the bridge's
  // slow path and wants to come after the page has been driven once.
  const scroller = t.scroller();
  scroller.scrollTop = scroller.scrollHeight;
  await t.sleep(500);
  const element = t.blocks()[t.blocks().length - 1];
  const reads = { rect: 0, height: 0 };
  const rects = Element.prototype.getBoundingClientRect;
  const heights = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  const keystrokes = [];
  try {
    Element.prototype.getBoundingClientRect = function () {
      reads.rect += 1;
      return rects.call(this);
    };
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        reads.height += 1;
        return this.getBoundingClientRect().height;
      }
    });
    t.key('x');
    await t.sleep(300);
    for (let index = 0; index < 10; index += 1) {
      const started = performance.now();
      t.key('x');
      keystrokes.push(performance.now() - started);
    }
  } finally {
    Element.prototype.getBoundingClientRect = rects;
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', heights);
  }

  const text = await t.raw();
  const blocks = splitBlocks(text);
  const block = blocks[blocks.length - 1];
  const state = new MarkdownEditorState(text);
  const children = state.getBlockContent(block);
  const parse = [];
  const build = [];
  for (let index = 0; index < 12; index += 1) {
    const startedParse = performance.now();
    const fresh = new MarkdownEditorState(text);
    fresh.getBlockContent(block);
    parse.push(performance.now() - startedParse);

    const startedBuild = performance.now();
    createBlockComponent({ ...block, type: 'block' }, children);
    build.push(performance.now() - startedBuild);
  }

  out.block = {
    kind: block.kind,
    characters: block.text.length,
    lines: block.text.split('\n').length,
    elements: element.querySelectorAll('*').length
  };

  // Rebuilding it, as the renderer does today: build, replace, force layout.
  const rebuild = [];
  for (let index = 0; index < 6; index += 1) {
    const started = performance.now();
    const fresh = createBlockComponent({ ...block, type: 'block' }, children).element;
    element.replaceWith(fresh);
    fresh.getBoundingClientRect();
    rebuild.push(performance.now() - started);
    fresh.replaceWith(element);
    element.getBoundingClientRect();
  }

  // Patching what a keystroke changes: one text node inside it.
  const nodes = t.textNodesIn(element);
  const node = nodes[Math.floor(nodes.length / 2)];
  const original = node.data;
  const patch = [];
  for (let index = 0; index < 6; index += 1) {
    const started = performance.now();
    node.data = `${original.slice(0, original.length - 1)}x`;
    element.getBoundingClientRect();
    patch.push(performance.now() - started);
    node.data = original;
    element.getBoundingClientRect();
  }

  out.medianMs = {
    blockParse: round(median(parse)),
    buildDetachedDom: round(median(build)),
    rebuildBlockAndForceLayout: round(median(rebuild)),
    patchTextNodeAndForceLayout: round(median(patch)),
    keystroke: round(median(keystrokes))
  };
  out.perKeystrokeReads = { rects: round(reads.rect / 11), offsetHeight: round(reads.height / 11) };
  return out;
})()
```

- [ ] **Step 2: Run it and read it**

Run: `npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" test/probes/block-rebuild-cost.js`
Expected: `rebuildBlockAndForceLayout` in the tens of milliseconds,
`patchTextNodeAndForceLayout` near zero, `buildDetachedDom` around a millisecond,
`blockParse` around ten. **If the rebuild is not the dominant term on this
document, stop here and re-plan**: the rest of this plan assumes it is.

Then run it against the demo document, which is the other end of the range:

Run: `npm run probe -- --fixture default-document.md test/probes/block-rebuild-cost.js`
Expected: the same shape, at smaller sizes. The demo's own keystroke is the slow one
(~87 ms in P6's run) because its blocks carry citations and wikilinks — which is
exactly what patching keeps.

- [ ] **Step 3: Add the probe to the index and commit**

`test/README.md` says how many probes there are; it goes from sixty-eight to
sixty-nine.

```bash
git add test/probes/block-rebuild-cost.js test/README.md
git commit -m "test(render): measure rebuilding a block against patching it"
```

### Task 2: Which of a block's children an edit left alone

**Files:**
- Create: `src/ui/markdown/document/block_children.ts`
- Create: `test/checks/check-block-children.mjs`
- Modify: `test/README.md` (the check index)

**Interfaces:**

- Consumes: nothing — the two child lists are passed in.
- Produces: `interface RenderedChild { type: string; source: string; shape: string }` and
  `function reusePlan(previous: readonly RenderedChild[], next: readonly RenderedChild[]): number[]`,
  which Task 3's `render_patch.ts` calls with the old records and the new parse.

- [ ] **Step 1: Write the check (RED)**

```js
/**
 * Checks the decision a patch is built on: which of a block's children an edit
 * left alone. Pure, so Node can drive the cases a keystroke, a paste and a
 * deletion produce, and the ones a naive positional match gets wrong.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/markdown/document/block_children.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-block-children-'));
const file = join(directory, 'block_children.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { reusePlan } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
const child = (type, source, shape = '') => ({ type, source, shape });

check('nothing changed: every child keeps its element', reusePlan(
  [child('paragraph', 'a'), child('paragraph', 'b')],
  [child('paragraph', 'a'), child('paragraph', 'b')]
), [0, 1]);
check('one child edited: only that one is built again', reusePlan(
  [child('text', 'a'), child('emphasis', 'b'), child('text', 'c')],
  [child('text', 'a'), child('emphasis', 'B'), child('text', 'c')]
), [0, -1, 2]);
check('a child inserted in front: the others keep their elements', reusePlan(
  [child('text', 'a'), child('text', 'b')],
  [child('text', 'new'), child('text', 'a'), child('text', 'b')]
), [-1, 0, 1]);
check('a child deleted: the rest still match', reusePlan(
  [child('text', 'a'), child('text', 'b'), child('text', 'c')],
  [child('text', 'a'), child('text', 'c')]
), [0, 2]);
check('the same source under another type is another node', reusePlan(
  [child('text', 'x')],
  [child('emphasis', 'x')]
), [-1]);
check('a node that starts showing its own source is built again', reusePlan(
  [child('link', '[a](b)'), child('text', 'after')],
  [child('link', '[a](b)', 'source'), child('text', 'after')]
), [-1, 1]);
check('and one that stops showing it is built again too', reusePlan(
  [child('link', '[a](b)', 'source')],
  [child('link', '[a](b)')]
), [-1]);
check('a child is handed out once', reusePlan(
  [child('text', 'both')],
  [child('text', 'both'), child('text', 'both')]
), [0, -1]);
check('two identical children keep one element each', reusePlan(
  [child('text', 'both'), child('text', 'both')],
  [child('text', 'both'), child('text', 'both')]
), [0, 1]);
check('an empty block parses nothing', reusePlan([], []), []);
check('a block that had nothing gets everything built', reusePlan([], [child('text', 'a')]), [-1]);
check('a block that lost everything builds nothing', reusePlan([child('text', 'a')], []), []);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('block children: all checks passed');
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node test/checks/check-block-children.mjs`
Expected: FAIL — the module does not exist yet (rolldown reports the missing
entry). This is the red half of the cycle.

- [ ] **Step 3: Write the module**

```ts
/**
 * Which of a block's children an edit left alone.
 *
 * A block renders as the nodes the parser made from its own text, and an edit
 * inside it usually changes one of them: a character typed into a paragraph's
 * text leaves its citations, links and emphasis exactly as they were. This is the
 * decision that lets the renderer keep their elements — a child is the one that
 * was there before when its type and its own source are unchanged, which is the
 * statement `blocks.ts: blockContentKey` makes about a block, one level down.
 *
 * May import: nothing — the children and their sources are passed in. Upholds: a
 * node's rendering is a pure function of its own source, so a node whose source is
 * unchanged is the node it was.
 */

/** A child as the renderer built it: what it is, the source it came from, and its shape. */
export interface RenderedChild {
  type: string;
  source: string;
  /** `'source'` while the node's own source is the one being shown, else `''`. */
  shape: string;
}

/**
 * For each of `next`, the index in `previous` whose element it can reuse, or -1
 * when it has to be built. A previous child is handed out at most once, so two
 * identical children keep one element each rather than the same one twice.
 */
export function reusePlan(
  previous: readonly RenderedChild[],
  next: readonly RenderedChild[]
): number[] {
  const byType = new Map<string, Map<string, Map<string, number[]>>>();
  previous.forEach((child, index) => {
    const bySource = byType.get(child.type) ?? new Map<string, Map<string, number[]>>();
    const byShape = bySource.get(child.source) ?? new Map<string, number[]>();
    const indexes = byShape.get(child.shape) ?? [];
    indexes.push(index);
    byShape.set(child.shape, indexes);
    bySource.set(child.source, byShape);
    byType.set(child.type, bySource);
  });
  return next.map((child) => {
    const indexes = byType.get(child.type)?.get(child.source)?.get(child.shape);
    return indexes && indexes.length > 0 ? indexes.shift()! : -1;
  });
}
```

- [ ] **Step 4: Run the check and the suite**

Run: `node test/checks/check-block-children.mjs`
Expected: `block children: all checks passed`

Run: `npx tsc --noEmit && npm run check`
Expected: clean, and `18/18 checks passed`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/markdown/document/block_children.ts test/checks/check-block-children.mjs \
  test/README.md
git commit -m "refactor(document): say which children an edit left alone"
```

The `test/README.md` row is one line, in the table's own words:

```md
| `check-block-children.mjs` | Which of a block's children an edit left alone (`document/block_children.ts`), which is what lets the renderer keep their elements |
```

### Task 3: Patch the block instead of rebuilding it

**Files:**
- Create: `src/ui/markdown/render_patch.ts`
- Modify: `src/ui/markdown/nodes/editable_node.ts` (tag the element with its node's range)
- Modify: `src/ui/markdown/virtual_block_renderer.ts` (`renderChanged`, `renderBlock`)
- Create: `test/probes/block-patch.js`
- Modify: `test/README.md` (the probe count)

**Interfaces:**

- Consumes: `reusePlan`, `RenderedChild` (Task 2); `createComponent` from
  `registry.ts`; `withRenderFrame` from `source_mode.ts`; `blockParseInput` from
  `document/blocks.ts`.
- Produces:
  `function rememberChildren(element: HTMLElement, children: RootContent[], prepared: string): void`
  — records what a just-built container element holds — and
  `function patchBlock(element: HTMLElement, block: BlockNode, children: RootContent[]): void`
  — re-renders what changed inside an already-built block element.

- [ ] **Step 1: Tag every node element with its node's range**

In `editable_node.ts`, the constructor gains two lines next to `classList.add`:

```ts
    // The patch in `render_patch.ts` pairs elements with the nodes they were
    // built for, and a node's own range is what says which element is which.
    // Positions are block-relative: every node is parsed from its block's own
    // text (see `state.getBlockContent`), so the offsets are positions in it.
    const position = (node as { position?: { start: { offset?: number }; end: { offset?: number } } })
      .position;
    if (position?.start.offset !== undefined && position.end.offset !== undefined) {
      element.dataset.nodeFrom = String(position.start.offset);
      element.dataset.nodeTo = String(position.end.offset);
    }
```

- [ ] **Step 2: Write the patch**

```ts
/**
 * Re-renders what an edit changed inside a block, and nothing else.
 *
 * An edit inside a block usually changes one node — the text the caret is in — so
 * this builds again only the children whose own source changed, recursing into a
 * container that survived but whose children did not. Keeping the rest is not an
 * optimisation of the DOM's size but of its churn: replacing a block's element
 * invalidates the layout of everything in and below it, which is where a
 * keystroke's tens of milliseconds go (see `test/probes/block-rebuild-cost.js`).
 *
 * What each container holds is remembered here rather than read back out of the
 * DOM, because the source a record compares against is the text the element was
 * built from, and that text is gone once the edit has landed. The records are
 * filled in when a block is built and rewritten by every patch.
 *
 * May import: the registry, the pure plan (`document/block_children.ts`), the block
 * model and `source_mode.ts`'s render frame. Upholds: a node's rendering is a pure
 * function of its own source — this is that rule applied to the DOM the renderer
 * already built.
 */

import type { RootContent } from 'mdast';
import { reusePlan, type RenderedChild } from './document/block_children';
import { blockParseInput, type BlockNode } from './document/blocks';
import { createComponent } from './registry';
import { isShownSource, withRenderFrame } from './source_mode';

/** What one container element was built from: its children, node by node. */
interface ChildRecord {
  node: RootContent;
  /** The child's own slice of the block's parse input, as it was when built. */
  source: string;
  /** `'source'` while the child's own source was the one being shown, else `''`. */
  shape: string;
  /** The element built for it, or null for a node type that renders nothing. */
  element: HTMLElement | null;
}

/** What each container element holds, filled in when it is built and by a patch. */
const rendered = new WeakMap<HTMLElement, ChildRecord[]>();

/** A node's own slice of the block's parse input, or '' when it has no range. */
function sourceOf(node: RootContent, prepared: string): string {
  const position = (node as { position?: { start: { offset?: number }; end?: { offset?: number } } })
    .position;
  return position?.start.offset !== undefined && position.end?.offset !== undefined
    ? prepared.slice(position.start.offset, position.end.offset)
    : '';
}

/**
 * The shape a node is built in, as a key: `'source'` while its own source is the
 * one being shown. Read inside a render frame, since `isShownSource` needs the
 * block being built to place the node's positions in the document.
 */
function shapeOf(node: RootContent): string {
  return isShownSource(node) ? 'source' : '';
}

/** An mdast node's children, if it has any. */
function childrenOf(node: RootContent): RootContent[] {
  const children = (node as { children?: RootContent[] }).children;
  return Array.isArray(children) ? children : [];
}

/** The element a node was built into, from the range tag it carries. */
function elementOf(container: HTMLElement, node: RootContent): HTMLElement | null {
  const position = (node as { position?: { start?: { offset?: number } } }).position;
  const from = position?.start?.offset;
  if (from === undefined) {
    return null;
  }
  for (const child of container.children) {
    if ((child as HTMLElement).dataset.nodeFrom === String(from)) {
      return child as HTMLElement;
    }
  }
  return null;
}

/**
 * Records what a container holds, for the children that were just built inside it.
 * Called once for a block's element — inside a render frame, so each child's shape
 * can be read — and by `patchChildren` for the nodes it builds.
 */
export function rememberChildren(element: HTMLElement, children: RootContent[], prepared: string): void {
  rendered.set(
    element,
    children.map((node) => {
      const child = elementOf(element, node);
      const inner = childrenOf(node);
      if (child && inner.length > 0) {
        rememberChildren(child, inner, prepared);
      }
      return { node, source: sourceOf(node, prepared), shape: shapeOf(node), element: child };
    })
  );
}

/**
 * Rebuilds inside `container` only the children `next` changed, in order, and
 * records what it holds now.
 */
function patchChildren(container: HTMLElement, next: RootContent[], prepared: string): void {
  const previous = rendered.get(container) ?? [];
  const plan = reusePlan(
    previous.map((record) => ({
      type: record.node.type,
      source: record.source,
      shape: record.shape
    })),
    next.map((node) => ({ type: node.type, source: sourceOf(node, prepared), shape: shapeOf(node) }))
  );
  const kept: Node[] = [];
  next.forEach((node, index) => {
    const reused = plan[index] >= 0 ? previous[plan[index]].element : null;
    const element = reused ?? createComponent(node)?.element ?? null;
    if (!element) {
      return;
    }
    if (reused) {
      const inner = childrenOf(node);
      if (inner.length > 0) {
        patchChildren(reused, inner, prepared);
      }
    }
    kept.push(element);
  });
  // Everything the new children need, in order, then whatever is left over.
  for (const element of kept) {
    container.appendChild(element);
  }
  // Only what this container was recorded as holding: the caret span and anything
  // else living inside a block is not the patch's to remove.
  for (const record of previous) {
    if (record.element && !kept.includes(record.element)) {
      record.element.remove();
    }
  }
  rememberChildren(container, next, prepared);
}

/** Re-renders the parts of an already-built block element that the edit changed. */
export function patchBlock(element: HTMLElement, block: BlockNode, children: RootContent[]): void {
  const prepared = blockParseInput(block);
  withRenderFrame(block, () => {
    patchChildren(element, children, prepared);
  });
}
```

Two notes for the implementer, because they are the parts that are easy to get
wrong. First, a patch may add and reorder only elements it built: what it removes is
what its own records say was there, never whatever else lives inside a block (the
caret span, for instance). Second, `rememberChildren` is called after the elements
are in place, including by the patch itself — a container's records are what the
*next* patch compares against, so a container that forgets to update them stops
being patchable and quietly rebuilds from then on.

- [ ] **Step 3: Use it from the renderer**

In `virtual_block_renderer.ts`, the block element is recorded when it is built, the
drop-and-rebuild in `renderChanged` becomes a patch when the block kept its kind and
its shape, and `renderBlock` goes through the same path. The new imports are
`isSourceBlock`/`withRenderFrame` from `source_mode.ts`, `rememberChildren`/
`patchBlock` from `render_patch.ts` and `blockParseInput` from `document/blocks.ts`,
and the class gains `private readonly builtKind = new WeakMap<HTMLElement, BlockKind>()`.

```ts
  private createBlockElement(block: MarkdownBlock): HTMLElement {
    const key = this.renderKey(block);
    const spare = this.spare.get(key);
    if (spare) {
      this.spare.delete(key);
      this.setIntrinsicSize(spare, this.sizes.heightOf(block));
      return spare;
    }
    const node: BlockNode = { ...block, type: 'block' };
    const children = this.state.getBlockContent(block);
    const element = createBlockComponent(node, children).element;
    // What this element holds, node by node, so a later edit can keep the halves
    // the edit did not reach (see `render_patch.ts`). Inside a render frame,
    // because each child's shape is read against the block being built.
    withRenderFrame(node, () => rememberChildren(element, children, blockParseInput(block)));
    this.setIntrinsicSize(element, this.sizes.heightOf(block));
    this.builtFrom.set(element, key);
    this.builtKind.set(element, block.kind);
    return element;
  }

  /**
   * Whether this element can be patched rather than built again: it was built
   * from a block of the same kind, and that block renders a child list rather than
   * one thing of its own — a display formula showing its text, a blank line and a
   * frontmatter block are each a single element, not children to patch.
   */
  private canPatch(block: MarkdownBlock, element: HTMLElement): boolean {
    return (
      !isSourceBlock(block) &&
      block.kind !== 'blank' &&
      block.kind !== 'frontmatter' &&
      this.builtKind.get(element) === block.kind
    );
  }

  renderChanged(): void {
    if (!this.root) {
      this.render();
      return;
    }
    const byLine = new Map<number, MarkdownBlock>();
    for (const block of this.state.getBlocks()) {
      byLine.set(block.lineStart, block);
    }
    const snapshot = this.hooks?.capture();
    for (const [lineStart, element] of [...this.mounted]) {
      const block = byLine.get(lineStart);
      if (!block) {
        this.releaseElement(element, this.builtFrom.get(element));
        this.mounted.delete(lineStart);
        continue;
      }
      const key = this.renderKey(block);
      if (this.builtFrom.get(element) === key) {
        continue;
      }
      // The same block, in the same shape, with different content: re-render what
      // changed inside it. Anything else — a new kind, a source that has opened or
      // closed, a block that was never built — is built again whole.
      if (this.canPatch(block, element)) {
        patchBlock(element, { ...block, type: 'block' }, this.state.getBlockContent(block));
        this.builtFrom.set(element, key);
        this.rememberHeight(block, element);
        continue;
      }
      this.releaseElement(element, this.builtFrom.get(element));
      this.mounted.delete(lineStart);
    }
    this.syncWindow(true);
    this.hooks?.restore(snapshot);
  }
```

`builtKind` is a second `WeakMap<HTMLElement, BlockKind>` set next to `builtFrom`
wherever that is set, because the patch is only safe when the element was built from
a block of the same kind (a paragraph's element is not a place a list's children can
be patched into). Keep the snapshot and `syncWindow(true)` where they are: the
window still has to run so dropped blocks are built and the spacers follow.

`renderBlock(lineStart)` — the path the formatting commands take — becomes the same
decision for one block:

```ts
  renderBlock(lineStart: number): void {
    const block = this.state.getBlockAtLine(lineStart);
    const current = this.mounted.get(lineStart);
    if (!block || !current || !this.root) {
      return;
    }
    const snapshot = this.hooks?.capture();
    const key = this.renderKey(block);
    if (this.canPatch(block, current)) {
      patchBlock(current, { ...block, type: 'block' }, this.state.getBlockContent(block));
      this.builtFrom.set(current, key);
      this.builtKind.set(current, block.kind);
      this.rememberHeight(block, current);
      this.refreshBlockTags();
      this.hooks?.restore(snapshot);
      return;
    }
    const element = this.createBlockElement(block);
    this.releaseElement(current, this.builtFrom.get(current));
    current.replaceWith(element);
    this.mounted.set(lineStart, element);
    this.rememberHeight(block, element);
    this.updateSpacers();
    this.refreshBlockTags();
    this.hooks?.restore(snapshot);
  }
```

- [ ] **Step 4: Write the probe that proves elements survive**

```js
/**
 * A keystroke inside a paragraph keeps the elements of the nodes it did not
 * touch: the citations, links and emphasis around the caret are not re-created.
 *
 * The demo document's formatted paragraph is the case; element identity is the
 * evidence, so no stopwatch is involved.
 *
 * @covers src/ui/markdown/render_patch.ts, src/ui/markdown/virtual_block_renderer.ts
 */
(async () => {
  const t = window.__t;
  const out = {};
  const paragraph = t
    .blocks()
    .find((element) => element.textContent.includes('This paragraph has'));
  if (!paragraph) {
    return { checks: [{ name: 'the demo document is loaded', actual: false, expected: true }], failed: ['the demo document is loaded'] };
  }
  const node = t.textNodesIn(paragraph).find((candidate) => candidate.data.includes('strikethrough'));
  const range = document.createRange();
  range.setStart(node, node.data.length);
  range.collapse(true);
  const rect = range.getBoundingClientRect();
  node.parentElement.dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: rect.left, clientY: rect.top + rect.height / 2 })
  );
  await t.sleep(200);

  const before = t.textNodesIn(paragraph).map((text) => text.parentElement);
  const heightBefore = Math.round(t.scroller().scrollHeight);
  t.key('x');
  await t.sleep(300);
  const after = t.blocks().find((element) => element.textContent.includes('This paragraph has'));
  out.paragraph = {
    blockSurvived: after === paragraph,
    nodesBefore: before.length,
    nodesSurviving: after
      ? t.textNodesIn(after).filter((text) => before.includes(text.parentElement)).length
      : 0,
    typed: after ? after.textContent.includes('strikethroughx') : false,
    heightGrowth: Math.round(t.scroller().scrollHeight) - heightBefore
  };
  return out;
})()
```

- [ ] **Step 5: Verify in the app**

Run: `npm run probe -- --fixture default-document.md test/probes/block-patch.js`
Expected: `blockSurvived: true`, all children surviving, `typed: true`.

Run each of: `edit-stability`, `spacing`, `block-gaps`, `empty-paragraphs`,
`paste-blocks`, `undo-after-scroll`, `footnote-button`, `footnote-notes-run`,
`table-cell-typing`, `table-keys` — with `--fixture default-document.md`, one at a
time. Expected: the same results as before this task, except that `edit-stability`
reports more surviving elements (it counts elements, it does not assert a number).

Run: `npx tsc --noEmit && npm run check`
Expected: clean, `18/18 checks passed`.

- [ ] **Step 6: Compare the cost, and commit**

Run: `npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" test/probes/edit-cost.js`
Expected: the per-keystroke median well below the 36 ms Task 1 recorded — the
rebuild is gone. Report the number in the commit message body if it is not what
this plan expects.

`test/README.md` goes from sixty-nine probes to seventy.

```bash
git add src/ui/markdown/render_patch.ts src/ui/markdown/nodes/editable_node.ts \
  src/ui/markdown/virtual_block_renderer.ts test/probes/block-patch.js test/README.md
git commit -m "refactor(render): patch the block, don't rebuild it"
```

### Task 4: The seams a patch has to respect

**Files:**
- Modify: `src/ui/markdown/virtual_block_renderer.ts` (the spare cache and
  `builtFrom` bookkeeping, the height after a patch)
- Modify: `test/probes/block-patch.js` (the source-mode and height cases)

**Interfaces:**

- Consumes: `patchBlock` (Task 3).
- Produces: nothing new; this task is the set of behaviours around a patch that
  the probes can see.

- [ ] **Step 1: Source mode through a patch**

A node whose source must be shown (a link, a citation, a formula, an image) is
built in another shape, and the caret moving into it is what changes that. The
paragraph around it must keep its element while the node itself is built again.
Add the case to `block-patch.js`:

```js
  // The shape rule: clicking into a link shows the link's own source, so that node
  // is a different element afterwards — while the paragraph that holds it is not.
  const linkBlock = t.blocks().find((element) => element.querySelector('a'));
  const anchor = linkBlock.querySelector('a');
  const box = anchor.getBoundingClientRect();
  anchor.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      clientX: box.left + 2,
      clientY: box.top + box.height / 2
    })
  );
  await t.sleep(300);
  const sourceShown = Boolean(t.prose().querySelector('.markdown-link-source'));
  t.key('z');
  await t.sleep(300);
  out.link = {
    sourceShown,
    paragraphSurvived: t.blocks().includes(linkBlock),
    typed: t
      .blocks()
      .some((element) => element.textContent.includes('z'))
  };
  return out;
```

The `return out` above replaces the one at the end of the probe's first case; the
probe ends with a single return of everything it measured.

Run: `npm run probe -- --fixture default-document.md test/probes/block-patch.js`
Expected: `sourceShown: true`, `paragraphSurvived: true`, `typed: true`.

Then the existing source-mode probes, one at a time:
`display-math-source`, `inline-math-source`, `revealable-flows`,
`revealed-source-exit`, `math-source-caret`. Expected: unchanged.

- [ ] **Step 2: The spare cache and the render key**

A patched element is remembered under the *new* render key, so it can be released
and reused like any other; a shape change still drops it. Make that explicit in the
code and check it with `scroll-cost` (the window must still mount and drop cleanly)
and `undo-after-scroll` (the case where the edited block left the window).

Run: `npm run probe -- --fixture default-document.md test/probes/undo-after-scroll.js`
Expected: `failed: []`, the same mounted counts as P6 recorded.

Run: `npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" test/probes/scroll-cost.js`
Expected: `settled: true` steps, times in the range P6 recorded.

- [ ] **Step 3: Heights after a patch**

A patch can change the block's height (a line gained, a node grown), and the
spacers have to follow. `rememberHeight` already runs on the patched block; the case
to prove is that the document height does not drift while typing, and the probe's
first case already measures it: `out.paragraph.heightGrowth` is the scroll height
after the keystroke minus the scroll height before it. One character cannot add more
than a line or two, so it must be under `2 * LINE_HEIGHT` (48, `block_sizes.ts`) —
and never a block's worth.

Run: `npm run probe -- --fixture default-document.md test/probes/block-patch.js`
Expected: `heightGrowth` under 48.

Run: `npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" test/probes/edit-cost.js`
Expected: `typedAtTheEnd` still true and the scroll anchor unmoved.

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit && npm run check`
Expected: clean, `18/18 checks passed`.

Run: `npm run probe:all`
Expected: `64/64 probes passed (6 skipped)` from a freshly started app — the
sixty-four are P6's sixty-two plus this phase's two.

```bash
git add src/ui/markdown/virtual_block_renderer.ts test/probes/block-patch.js
git commit -m "refactor(render): keep the shape, heights and spares through a patch"
```

### Task 5: Acceptance and handoff

- [ ] `npx tsc --noEmit`; `npm run check` (`18/18`); a freshly started app;
  `npm run probe:all` (`64/64`, 6 skipped).
- [ ] `docs/architecture.md`: a paragraph where "One keystroke" is described — the
  renderer patches the block it edited instead of rebuilding it, and what that
  means for "a block's rendering is a pure function of its own source".
- [ ] Append the handoff to this plan: the before/after numbers
  (`block-rebuild-cost.js` and `edit-cost.js`), what the new check and probe pin,
  and what is left — the parse (~10 ms a keystroke), the remaining layout reads,
  and lazy block offsets with the reason this plan records for deferring them.
- [ ] Commit: `docs: close the incremental block rendering handoff`.

---

## Part 4 — notes for the implementer

- The probes are the phase's spine again, and the first one is the reason to build
  anything: run Task 1 before Task 2, and stop if the rebuild is not the cost.
- Do not "improve" the parse in this phase. It is the next term, it is a parser
  question, and the profile from Task 1 is what a parser phase should start from.
- A patch must not change what is rendered: the same nodes, the same classes, the
  same order. The difference is that the elements that were already right are the
  same elements afterwards — which is also what the caret wants, since a range the
  browser relocates is a range the editor then has to restore by offset.
- Keep the pure decision (`block_children.ts`) free of the DOM. It is the half a
  check can drive, and it is the half the next phase — whatever re-renders blocks
  after this one — will want to reuse.
