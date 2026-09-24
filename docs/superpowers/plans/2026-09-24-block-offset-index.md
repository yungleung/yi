# A Block Offset Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an edit stops rewriting the blocks below it — their positions are derived
from an index the state keeps, so typing near the top of a long note costs what
typing near the bottom costs.

**Architecture:** a `BlockIndex` (`document/block_index.ts`) holds a Fenwick tree over
the blocks' own lengths and another over their line counts, plus the block's position
in each: `charStart`, `charEnd`, `lineStart` and `lineEnd` become *derived* — the four
properties keep their names and types, so the fourteen modules that read them do not
change. `splitBlocksFrom` hands the tail back as the objects it was; the index takes a
point update for each block the edit rebuilt, and is rebuilt whole only when the
block *count* changes (a structural edit, which renders everything anyway).

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** this document's part 1; `docs/roadmap.md` item 1, which names P6's handoff
as its source.

## Global Constraints

- **Behaviour is preserved.** The same edits produce the same text, the same blocks
  with the same fields, the same rendered content and the same caret offset.
- **The offsets do not move.** `getText()`, `getBlocks()`, `getBlockAtOffset`,
  `getBlockAtLine`, `getBlockContent`, `historyEdits()`, `undo`, `redo`,
  `loadText` and `validateBlocks` keep their signatures and their meaning. A block's
  four position fields keep their names and their meaning for every reader.
- `npx tsc --noEmit` and `npm run check` stay green, and the check count grows;
  `npm run probe:all` stays green, with the probe count growing by one.
- Commit style: `test(…): …`, `refactor(…): …`, `docs: …`, and a `merge:` commit.

---

## Part 1 — the design

### 1.1 The measurement (2026-09-24)

The fixture note (314 266 characters, 484 blocks), the state alone, no DOM — a
throwaway probe, `replaceRange` at one character a time:

| What | Value |
| --- | --- |
| materialising the document as a string, once per version | **0 ms** — V8 hands back a sliced string |
| a whole split of the document | 1 ms |
| a keystroke's state edit, caret at the **end** of the note | **0 ms**, 2 blocks are new objects |
| a keystroke's state edit, caret at the **top** of the note | **1 ms**, **484 of 484 blocks are new objects** (their text strings are shared: 483 unchanged) |

So the string P6 worried about is free now, and the split is 1 ms; what is left is
`blocks.ts: moved()` — every block below the edit rebuilt, because its four positions
are absolute numbers on the block itself.

### 1.2 The index

`charStart(i)` is the sum of the *strides* of the blocks before `i` — a block's own
length plus the gap to the next block, which is the blank lines between them and the
line ending that ends the block's own last line (the blocks do not tile the text: a
blank block is zero characters long and the newlines between blocks belong to no
block, see `state.ts: validateBlocks`). `lineStart(i)` is the sum of their line spans.
An edit inside one block changes one stride and no tail; an edit that rebuilds `k`
blocks changes `k` entries; only an edit that changes the number of blocks moves the
blocks after it, and those have to be renumbered whatever the representation is.

So: a Fenwick tree over the lengths and another over the line counts, and a map from
block to position. A block's getters ask the index it was built with. A point update
is O(log n) and covers typing; a rebuild of both trees and the map is O(blocks) and
covered by structural edits, which already rebuild the window and the spacers.

`getBlockAtOffset` and `getBlockAtLine` keep their binary search over the array, with
one getter call per probe — O(log n) probes of an O(log n) prefix sum. (The search
could be a descent over the tree instead; not worth it until a profile says so.)

### 1.3 What this does not fix

- `renderChanged` builds a `Map` of every block per edit (484 inserts, cheap), and
  `updateSpacers` walks every block when a block's height changed or the window
  moves. Both are O(blocks) and neither is the split's shape; a height index is a
  follow-on if a profile ever asks for one.
- The text itself: `getText()` materialises a version lazily and V8 makes that
  cheap; a line index for the *split* would be a second structure over the same
  text with no measured prize.

---

## Part 2 — tasks

### Task 1: The index, with a check

**Files:**
- Create: `src/ui/markdown/document/block_index.ts`
- Create: `test/checks/check-block-index.mjs`
- Modify: `test/README.md` (the check index)

**Interfaces:**

- Produces: `interface BlockEntry { length, span, gap }`,
  `interface IndexedEntry extends BlockEntry { key: object }` and `class BlockIndex`
  with `constructor(entries: readonly IndexedEntry[])`,
  `set(key: object, entry: BlockEntry): void`,
  `place(position: number, key: object, entry: BlockEntry): void`,
  `rebuild(keys: readonly object[]): void`, `startAt(position)`, `endAt(position)`,
  `lineAt(position)`, `endLineAt(position)`, `startOf(key)`, `endOf(key)`,
  `lineOf(key)` and `endLineOf(key)`.
  `gap` is the characters between this block's end and the next block's start; the
  index sums `length + gap` per block, which is the distance to the next start.
  `set` remembers a block that is about to arrive past the end of a list that has to
  be rebuilt; `place` is the typing case, which keeps every position it can.

- [x] **Step 1: Write the check (RED)**

```js
/**
 * Checks the index that holds where the blocks are: a prefix sum over their own
 * lengths and line counts, kept across the edits that change one block, and rebuilt
 * when an edit changes how many blocks there are.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/markdown/document/block_index.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-block-index-'));
const file = join(directory, 'block_index.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { BlockIndex } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const blocks = ['abc', 'defgh', 'ij', 'klmn'].map((text, at) => ({
  text,
  span: at === 1 ? 2 : 1
}));
const index = new BlockIndex(blocks);
const starts = (tree) => blocks.map((_, at) => tree.startAt(at));
const lines = (tree) => blocks.map((_, at) => tree.lineAt(at));

check('the first block starts at zero', index.startAt(0), 0);
check('a block starts where the ones before it end', starts(index), [0, 3, 8, 10]);
check('a block ends where the next one starts', index.endAt(2), 10);
check('the last block ends at the document length', index.endAt(3), 14);
check('lines count the same way, from one', lines(index), [1, 2, 4, 5]);
check('a block is asked directly as well', index.startOf(blocks[2]), 8);

// An edit inside a block moves the ones after it and nothing else.
const longer = { text: 'defghxyz', span: 2 };
index.place(1, longer);
check('an update moves the blocks after it', starts(index), [0, 3, 11, 13]);
check('and leaves the ones before it alone', lines(index), [1, 2, 4, 5]);
check('the edited block ends where it now says', index.endOf(longer), 11);
check('and the block it replaced is not asked about', index.startAt(1), 3);

// A structural edit changes how many blocks there are: everything after it
// renumbers, which is the one thing a representation cannot avoid.
const spliced = [blocks[0], longer, { text: 'abcdefg', span: 3 }, { text: 'h', span: 1 }, blocks[3]];
index.rebuild(spliced);
check('a rebuild renumbers the tail', spliced.map((_, at) => index.startAt(at)), [0, 3, 11, 18, 19]);
check('and its line numbers', spliced.map((_, at) => index.lineAt(at)), [1, 2, 4, 7, 8]);

index.rebuild(blocks);
check('a rebuild puts it back', starts(index), [0, 3, 8, 10]);
check('and a block that came back with it knows its place', index.endOf(blocks[3]), 14);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('block index: all checks passed');
```

Run: `node test/checks/check-block-index.mjs`

Expected: FAIL — the module does not exist.

- [x] **Step 2: Write the index**

```ts
/**
 * Where the blocks are, without writing it on every block: a prefix sum over the
 * blocks' own lengths and line counts.
 *
 * An edit that changes one block's length is one point update here, and the blocks
 * after it are moved by arithmetic instead of by rewriting them; only an edit that
 * changes how many blocks there are has to be renumbered. Both trees are Fenwick
 * trees — a point update and a prefix sum are each O(log blocks) — and the position
 * of each block is kept in a `WeakMap`, so a block that is handed back unchanged
 * still knows where it is.
 *
 * May import: nothing. Upholds: one fact about where a block is has one home — the
 * blocks keep their own text and their own counts, and this is the only place the
 * sums that turn those into document offsets are kept.
 */

export interface BlockEntry {
  /** The block's own length, in characters. */
  length: number;
  /** How many lines the block spans. */
  lines: number;
}

export class BlockIndex {
  private lengths: number[];
  private counts: number[];
  private positions = new WeakMap<object, number>();
  ...
}
```

with `startOf`/`endOf`/`lineOf` as prefix queries (`endOf = startOf + length`),
`update`/`splice`/`rebuild` as the two Fenwick updates plus the `WeakMap` bookkeeping,
and a private `prefix(tree, count)` helper. Positions in the trees are 1-based;
positions in the API are 0-based and out-of-range asks are clamped, because callers
read `endOf(last)` for the document length.

- [x] **Step 3: Run it**

Run: `node test/checks/check-block-index.mjs`

Expected: `block index: all checks passed`. Done — `check-block-index.mjs` as
committed is the version to read; the snippets above are what it was written from.

- [x] **Step 4: Index it, and commit**

`test/README.md` gains the row for `check-block-index.mjs` beside `check-blocks.mjs`.

```bash
git add src/ui/markdown/document/block_index.ts test/checks/check-block-index.mjs test/README.md
git commit -m "feat(document): hold where the blocks are in an index"
```

### Task 2: The blocks derive their positions, and the tail is not rewritten

**Files:**
- Modify: `src/ui/markdown/document/blocks.ts`
- Modify: `src/ui/markdown/document/state.ts`
- Modify: `test/checks/check-blocks.mjs`

**Interfaces:**

- Consumes: `BlockIndex` and `IndexedEntry` (Task 1).
- Produces: the same `MarkdownBlock` fields and the same
  `splitBlocks(text, index?)` / `splitBlocksFrom(text, previous, edit, index?)`
  signatures, with `index` defaulting to a fresh one; the four position properties
  are getters over it.

- [x] **Step 1: Make the block a view over the index**

```ts
/** A block: its own source and kind, and where it is — which the index knows. */
class BlockView implements MarkdownBlock {
  readonly kind: BlockKind;
  readonly format?: 'yaml' | 'toml';
  readonly text: string;
  /** How many lines this block spans, which the split already counted. */
  readonly span: number;
  private readonly index: BlockIndex;

  constructor(index: BlockIndex, kind: BlockKind, text: string, span: number, format?: 'yaml' | 'toml') {
    this.index = index;
    this.kind = kind;
    this.text = text;
    this.span = span;
    this.format = format;
  }

  get lineStart(): number {
    return this.index.lineOf(this);
  }
  get lineEnd(): number {
    return this.lineStart + this.span - 1;
  }
  get charStart(): number {
    return this.index.startOf(this);
  }
  get charEnd(): number {
    return this.charStart + this.text.length;
  }
}
```

`MarkdownBlock` keeps its four position fields as `readonly` properties and gains the
one it counts anyway — `readonly span: number`, the lines the block spans — because
the index reads a block's length and span from the block. Every block is built
through a helper that also registers it:

```ts
/** The block for this slice, in this index. */
function blockAt(
  index: BlockIndex,
  kind: BlockKind,
  text: string,
  span: number,
  format?: 'yaml' | 'toml'
): MarkdownBlock {
  return new BlockView(index, kind, text, span, format);
}
```

The walk registers each block it produces with `index.place(position, block)`, and a
list whose length changed is `index.rebuild(blocks)`ed once. The generator's
`position` / `lineStart` bookkeeping becomes the `span` it already knows; `moved()`
goes.

- [x] **Step 2: Hand the tail back, and keep the index honest**

In `splitBlocksFrom`, the tail becomes:

```ts
      // Below that end the text is the text it was, and the blocks below it are the
      // blocks it was: their own text and counts have not changed, and where they
      // are is the index's business (see `block_index.ts`). Nothing to copy.
      for (const tail of previous.slice(resume.above + produced)) {
        blocks.push(tail);
      }
      index.reindex(blocks.slice(resume.above));
      return blocks;
```

and each block the walk *does* produce is `place`d at the position it replaces
(`index.place(resume.above + produced, block)`, one call per rebuilt block). Where
the count changes — the walk ends without matching, or `resume` is absent and the
whole document is split — the index is rebuilt from the finished list:
`index.rebuild(blocks)`. `state.ts` creates one `BlockIndex` in its constructor and
passes it to every split; `loadText` rebuilds it with the new document.

- [x] **Step 3: Strengthen the check**

`check-blocks.mjs` already compares `splitBlocksFrom` against `splitBlocks` field by
field after every edit of its sequences, and has an identity case for an edit that
moves nothing. Extend the identity case to edits that *do* move the blocks below —
a character typed in the first block, a line inserted above them — and assert that
the tail comes back as the same objects, with their new fields equal to a full
split's:

```js
// The tail is handed back, not rebuilt: an edit above it moves it by arithmetic,
// so the objects the renderer, the caret tags and the parse cache already know are
// the objects that come back.
const before = split(text, index);
const after = splitFrom(edited, before, edit, index);
check('an edit above hands the blocks below back untouched',
  after.slice(1).every((block, at) => block === before[at + 1]), true);
check('and their fields are a full split\'s',
  after.map(fields), splitBlocks(edited).map(fields), true);
```

Run: `node test/checks/check-blocks.mjs && node test/run-checks.mjs`

Expected: all checks green.

- [x] **Step 4: Commit**

```bash
git add src/ui/markdown/document/blocks.ts src/ui/markdown/document/state.ts test/checks/check-blocks.mjs
git commit -m "refactor(document): derive a block's position from the index"
```

### Task 3: The probe, and the number

**Files:**
- Create: `test/probes/block-offset-cost.js`
- Modify: `test/README.md` (the probe index)

**Interfaces:**

- Consumes: `document/state.ts`, `document/text_store.ts` through `t.app`.
- Produces: the numbers the handoff quotes.

- [ ] **Step 1: The probe**

```js
/**
 * What an edit costs the document itself, typed at the top of a long note and at its
 * end, and how many blocks come back as new objects.
 *
 * The state's own edit — the store, the split, the blocks — is measured directly,
 * with no DOM: a keystroke near the top used to rewrite every block below it, which
 * is what this phase removes. The text as a string is measured too, because P6
 * recorded it as the other half of the cost and it is now free (V8 hands back a
 * sliced string).
 *
 * @covers src/ui/markdown/document/block_index.ts, src/ui/markdown/document/blocks.ts
 * @needs-large-document — run against the 323 KB fixture note.
 */
(async () => {
  const t = window.__t;
  const { MarkdownEditorState } = await t.app('/src/ui/markdown/document/state.ts');
  const { TextStore } = await t.app('/src/ui/markdown/document/text_store.ts');
  const out = t.report({});
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const round = (value) => Math.round(value * 100) / 100;
  const text = await t.raw();

  const materialise = [];
  for (let index = 0; index < 10; index += 1) {
    const started = performance.now();
    new TextStore(text).toString();
    materialise.push(performance.now() - started);
  }
  out.materialiseMs = round(median(materialise));

  const typedAt = (where) => {
    const state = new MarkdownEditorState(text);
    const before = state.getBlocks();
    const edits = [];
    for (let index = 0; index < 30; index += 1) {
      const started = performance.now();
      state.replaceRange(where + index, where + index, 'x');
      edits.push(performance.now() - started);
    }
    const after = state.getBlocks();
    return {
      ms: round(median(edits)),
      blocks: after.length,
      rewritten: after.filter((block, index) => block !== before[index]).length,
      sameText: after.filter((block, index) => block.text === before[index]?.text).length
    };
  };
  out.atTheTop = typedAt(1);
  out.atTheEnd = typedAt(text.length - 1);
  return out;
})()
```

- [ ] **Step 2: Run it, before and after**

Run:

```bash
npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" \
  test/probes/block-offset-cost.js
```

Expected (from the throwaway run on `main`): `materialiseMs: 0`, `atTheTop.ms: 1` with
`rewritten: 484` of 484, `atTheEnd.ms: 0` with `rewritten: 2`. After this phase:
`atTheTop.rewritten` counts only the blocks the edit itself rebuilt (a handful), and
`atTheTop.ms` is at or below 0.5. Report both runs in the handoff.

- [ ] **Step 3: Index it, and commit**

```bash
git add test/probes/block-offset-cost.js test/README.md
git commit -m "test(document): measure an edit without rewriting the tail"
```

### Task 4: Acceptance, docs, handoff

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/superpowers/plans/2026-09-24-block-offset-index.md`

- [ ] **Step 1: The docs**

`docs/architecture.md`: where the block model is described, say that a block keeps its
own text and its counts and that where it sits is the index's arithmetic — so an edit
moves the blocks below it without touching them. `docs/roadmap.md`: item 1 moves to
Closed, with the numbers and the one thing that stays O(blocks) (a structural edit
renumbers, and `renderChanged` walks the window).

- [ ] **Step 2: Acceptance**

```bash
npx tsc --noEmit
npm run check                                   # 20/20 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 67/67 probes, 6 skipped
```

- [ ] **Step 3: The handoff, and the commit**

Append to this plan: what changed, the numbers (the state's edit at the top and the
end of the note, before and after; the rewritten-block counts; the check counts), and
what is left (undo ergonomics, the footnote gap, punctuation and digits, the two
O(blocks) passes this phase did not touch).

```bash
git add docs/architecture.md docs/roadmap.md docs/superpowers/plans/2026-09-24-block-offset-index.md
git commit -m "docs: close the block index handoff"
```

- [ ] **Step 4: Merge**

```bash
git checkout main
git merge --no-ff codex/block-offset-index -m "merge: keep where the blocks are in an index (block offsets)"
git rev-parse HEAD^{tree} codex/block-offset-index^{tree}   # must be equal
```

Keep the branch, and report the tree hash.
