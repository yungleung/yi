# A Keystroke Without a Parse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a plain keystroke stops parsing its block — the caret's source lookup is
the only parse the fast path still pays, and it exists to re-decide an answer the
edit cannot have changed.

**Architecture:** `applyEdit`'s fast path writes into a text node whose text *is*
the document's (`editing/typed_text.ts` proves it), so the caret stays in the node
it was in; the source decision is therefore held while the caret is placed, and the
one thing that would lag — the shown range — is moved by the edit with
`syntax/edit_range.ts: shiftOffset`, the rule the tags already use. The ordinary
path keeps deciding from the parse, which is the parse its rebuild needs anyway,
and the deferred check keeps its once-a-burst parse.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** this document's part 1. The design document
(`docs/superpowers/specs/2026-09-21-markdown-editor-architecture-design.md`) states
the invariants this phase serves, as it did for P5–P7, and
`docs/superpowers/plans/2026-09-23-incremental-block-rendering.md` is the phase
whose handoff names this one.

## Global Constraints

- **Behaviour is preserved.** The same edits produce the same text, the same
  blocks, the same rendering, the same shown source and the same caret offset.
- **The offsets do not move.** `getText()`, `getBlocks()`, `getBlockAtOffset`,
  `getBlockAtLine`, `getBlockContent`, `historyEdits()`, `undo`, `redo` and
  `loadText` keep their signatures and their meaning.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` stays
  green, with the probe count growing by one.
- Commit style: `test(…): …`, `refactor(…): …`, `docs: …`, and a `merge:` commit at
  the end.

---

## Part 1 — the design

### 1.1 The measurement

`test/probes/block-rebuild-cost.js` on the 323 KB fixture note's last block (4580
characters, 41 lines, 189 elements), and a throwaway probe that counts the block's
parses around a keystroke:

| What was measured | Value |
| --- | --- |
| the app's keystroke, back to back | **11 ms** (P7's number: unchanged) |
| the app's keystroke, spaced | **19 ms** |
| `getBlockContent` calls per keystroke, and where | **2**, attributed `sourceRangeAt>showSourceAt>restoreCaret` (a miss: the parse) and `…>followCaret` (a cache hit) |
| parsing that block, and a typical one | **8 ms** (4755 characters), **2 ms** (714) |
| parsing all 484 blocks of the note | **472 ms** |

### 1.2 What the lookup is for, and why the fast path does not need it

`showSourceAt` answers one question — which node's markdown source should stand in
for its rendering at this caret — and it answers it from the block's parse
(`sourceRangeAt` walks the tree for the outermost node whose type shows a source).

That parse is not wasted on the ordinary path: the rebuild that follows needs the
same parse under the same content key, so the render hits the cache. On the fast
path nothing rebuilds, so the parse exists only to re-decide. The decision cannot
have changed:

- the caret is inside a `[data-text-from]` span that is its text node's only child
  and whose text is the document's own characters, one for one — that is
  `editing/typed_text.ts: plainRun`, and it is what a written run is;
- the rule accepts letters only, in a word of letters, with letters or a space
  beside the edit, away from line edges and setext underlines;
- so the caret after the edit is in the same node of the same parse it was in
  before, and the source to show at it is the same source.

That last step is a claim about the parser, so it is a property, not a comment:
`test/checks/check-plain-edit.mjs` gets it, over its corpus and the editor's own
parse (`document/state.ts`), beside the shape property it already checks.

### 1.3 The one thing that would lag

`source_mode.ts` holds the shown range as module state, decided from the caret. The
fast path's write moves document offsets, so a range covering the block the caret
is in has to move with them: a deletion inside a block that shows its own text
otherwise leaves the range past the block's end, `isSourceBlock` answers false the
next time the block is built without a fresh decision (a window sync), and a
formula the caret is inside comes back as KaTeX.

The rule for that is the one P8 gave one home: `syntax/edit_range.ts: shiftOffset`.

### 1.4 Not this phase, and why

**The ordinary path's parse.** Typing a space re-parses its block, and that parse is
what the rebuild renders from; making *it* cheaper is a parser question, not a
caret one, and it wants its own measurement.

**Deriving the parse.** A plain edit could produce the new tree from the old one
(shift the positions, rewrite the leaf) and cache it under the new content key,
which would make every consumer of the parse free — including the deferred check,
which would then have to parse freshly to stay a check. That is a second kind of
entry in a cache whose contract is "what the parser produced", for no keystroke this
phase does not already free.

**Answering from the rendered tags.** The source question could be answered from the
DOM (`SOURCE_SELECTOR`, the caret's element) instead of the parse — but only where
the DOM is known current, which is exactly the fast path, and it needs the
source-block case handled separately. Same saving, more machinery.

---

## Part 2 — tasks

### Task 1: The property the skip rests on

**Files:**
- Modify: `test/checks/check-plain-edit.mjs`

**Interfaces:**
- Consumes: `document/state.ts` (`MarkdownEditorState`) through the check's own
  `load` helper, which bundles a module with rolldown — `check-history.mjs` does the
  same with the same module.
- Produces: nothing; this is the licence for Task 3.

- [ ] **Step 1: Add the property**

```js
// The parse reaches `decode-named-character-reference`, whose bundled build makes an
// element at import time; `check-history.mjs` installs the same stub before it
// bundles this module.
globalThis.document = {
  addEventListener() {},
  createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {}, setAttribute() {} }),
  querySelectorAll: () => [],
  querySelector: () => null,
  createRange: () => ({})
};
globalThis.window = { getSelection: () => null, addEventListener() {} };

const { MarkdownEditorState } = await load('src/ui/markdown/document/state.ts', 'state');

/**
 * The path of node types down to the node an offset sits in, e.g.
 * `paragraph>link>text`. The caret is "in" the outermost node whose source can
 * stand in for its rendering, which is why the path is compared, not the leaf.
 */
const nodePathAt = (state, offset) => {
  const block = state.getBlockAtOffset(offset);
  if (!block) {
    return null;
  }
  const path = [];
  let nodes = state.getBlockContent(block);
  const within = offset - block.charStart;
  while (Array.isArray(nodes) && nodes.length > 0) {
    const node = nodes.find((child) => {
      const start = child.position?.start?.offset ?? 0;
      const end = child.position?.end?.offset ?? start;
      return within >= start && within <= end;
    });
    if (!node) {
      break;
    }
    path.push(node.type);
    nodes = node.children;
  }
  return path.join('>');
};
```

Then, in the walk loop, beside the shape comparison:

```js
        // The caret is the offset the edit leaves behind, and the fast path trusts
        // that it is still in the node it was in: the same type path, before and
        // after. (The editor's own parse, block by block.)
        const left = nodePathAt(new MarkdownEditorState(before), from);
        const arrived = nodePathAt(new MarkdownEditorState(after), from + inserted.length);
        if (left !== arrived) {
          failures.push(
            `the rule accepted an edit that moved the caret's node\n  before ${JSON.stringify(before)}\n` +
              `  edit ${JSON.stringify({ from, to, inserted })}\n  after ${JSON.stringify(after)}\n` +
              `  ${left} → ${arrived}`
          );
        }
```

- [ ] **Step 2: Run it**

Run: `node test/checks/check-plain-edit.mjs`

Expected: `plain edit: all checks passed (530 accepted edits)`. The property holds
today — it is the argument for Task 3, and what keeps a construct added later from
quietly breaking it.

- [ ] **Step 3: Commit**

```bash
git add test/checks/check-plain-edit.mjs
git commit -m "test(syntax): say that a plain edit keeps the caret's node"
```

### Task 2: The shown range moves with the edit, and can be held

**Files:**
- Modify: `src/ui/markdown/source_mode.ts`
- Modify: `test/checks/check-math-source.mjs`

**Interfaces:**
- Consumes: `syntax/edit_range.ts` (`TextEdit`, `shiftOffset`).
- Produces: `moveShownSource(edit: TextEdit): void` and
  `withHeldShownSource<T>(build: () => T): T` and `shownSourceHeld(): boolean`,
  which Task 3 calls from `editing/context.ts`.

- [ ] **Step 1: Write the failing check**

Add to `test/checks/check-math-source.mjs`, which already bundles this module (its
`formula` block is `block('$$\n\\frac{a}{b}\n$$', 10)`), and extend the destructuring
import at its top with `moveShownSource` and `shownSourceWithinBlock`:

```js
// A shown range moves with an edit the way any other offset does: an edit inside it
// moves it, one after it does not (`syntax/edit_range.ts: shiftOffset`). The case
// that matters is a deletion inside a block that shows its own text: without the
// move the range ends up past the block, `isSourceBlock` answers false, and the
// block comes back as its rendering the next time it is built.
setShownRange({ from: formula.charStart, to: formula.charEnd });
moveShownSource({ from: formula.charStart + 4, to: formula.charStart + 5, replacement: '' });
check(
  'a deletion inside the shown range leaves the block its own source',
  isSourceBlock({ ...formula, charEnd: formula.charEnd - 1 }),
  true
);
setShownRange({ from: formula.charStart, to: formula.charStart + 4 });
moveShownSource({ from: formula.charEnd, to: formula.charEnd, replacement: 'zz' });
check('an edit after the shown range leaves it where it is', shownSourceWithinBlock(formula), 0);
```

Run: `node test/checks/check-math-source.mjs`

Expected: FAIL — `moveShownSource is not a function`.

- [ ] **Step 2: Implement it**

```ts
/**
 * Moves the shown range with an edit: it names document offsets, so an edit inside
 * or before it moves it, and an edit after it does not. The fast path in
 * `editing/context.ts` calls this — it writes into a text node without deciding the
 * source again, and this is the half of that decision an edit can still change.
 */
export function moveShownSource(edit: TextEdit): void {
  if (!shownRange) {
    return;
  }
  const from = shiftOffset(shownRange.from, edit);
  shownRange = { from, to: Math.max(from, shiftOffset(shownRange.to, edit)) };
}

/**
 * Holds the decision while `build` runs. What calls this knows the answer cannot
 * have changed — the caret is in the node it was in — and asking again costs the
 * block's parse. A decision asked for while held does nothing at all.
 */
export function withHeldShownSource<T>(build: () => T): T {
  held += 1;
  try {
    return build();
  } finally {
    held -= 1;
  }
}

/** Whether the shown source is held, which is what `showSourceAt` checks. */
export function shownSourceHeld(): boolean {
  return held > 0;
}
```

with `let held = 0;` beside `shownRange`, `import { shiftOffset, type TextEdit }
from './syntax/edit_range';` at the top, and the module header's "May import" line
extended with the edit arithmetic.

- [ ] **Step 3: Make the decision respect the hold**

In `editing/context.ts: showSourceAt`, as its first statement:

```ts
  if (shownSourceHeld()) {
    return;
  }
```

Run: `node test/checks/check-math-source.mjs`

Expected: `math source: all checks passed`.

- [ ] **Step 4: Commit**

```bash
git add src/ui/markdown/source_mode.ts src/ui/markdown/editing/context.ts test/checks/check-math-source.mjs
git commit -m "refactor(source): move and hold the shown range"
```

### Task 3: The fast path stops asking

**Files:**
- Modify: `src/ui/markdown/editing/context.ts` (the fast path in `applyEdit`)
- Create: `test/probes/plain-edit-parse.js`

**Interfaces:**
- Consumes: `moveShownSource`, `withHeldShownSource` (Task 2).
- Produces: nothing new; the probe reports what the fast path asks for.

- [ ] **Step 1: Change the fast path**

```ts
  if (run) {
    writeRun(run, replacement);
    const block = context.state.getBlockAtOffset(from + replacement.length);
    if (block) {
      context.renderer.measureEditedBlock(block.lineStart);
    }
    // The caret is in the text node the write went into, and that node is the
    // document's own text (`plainRun` proved it): an edit the rule accepts cannot
    // move the caret into another node, so which source is shown cannot have
    // changed, and asking would parse the block (see `source_mode.ts`, and the
    // property in `test/checks/check-plain-edit.mjs`). The range the edit did move
    // is moved with it, and the decision stays held while the caret is placed:
    // placing it notifies the caret observer (`markdown_editor.ts: followCaret`),
    // which would ask.
    moveShownSource({ from, to, replacement });
    withHeldShownSource(() => restoreCaret(context, target));
    keepScroll(context, anchor);
    return;
  }
```

`editing/context.ts` imports both from `../source_mode`.

- [ ] **Step 2: The probe**

```js
/**
 * What a plain keystroke asks its block's parse for, against what a structural one
 * asks for. The fast path writes into a text node and renders nothing, so it has no
 * reason to parse — and the lookup that used to (`showSourceAt`, resolving the
 * caret's source) is what this probe counts, by caller.
 *
 * @covers src/ui/markdown/editing/context.ts, src/ui/markdown/source_mode.ts
 */
(async () => {
  const t = window.__t;
  const { MarkdownEditorState } = await t.app('/src/ui/markdown/document/state.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  /** Types `keys` at a caret inside `needle`, counting the block's parse calls. */
  const count = async (document_, needle, keys) => {
    await t.load(document_);
    const block = t.blocks()[0];
    const node = t.textNodesIn(block).find((leaf) => leaf.data.includes(needle));
    const caret = document.createRange();
    caret.setStart(node, node.data.indexOf(needle) + 1);
    caret.collapse(true);
    const box = caret.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left,
        clientY: box.top + box.height / 2
      })
    );
    await t.sleep(200);
    const calls = [];
    const original = MarkdownEditorState.prototype.getBlockContent;
    MarkdownEditorState.prototype.getBlockContent = function (wanted) {
      calls.push(
        String(new Error().stack ?? '')
          .split('\n')
          .slice(1, 4)
          .map((line) => line.split('@')[0].trim())
          .join('>')
      );
      return original.call(this, wanted);
    };
    try {
      for (const key of keys) {
        t.key(key);
      }
      await t.sleep(300);
    } finally {
      MarkdownEditorState.prototype.getBlockContent = original;
    }
    return { calls, sameBlock: t.blocks()[0] === block };
  };

  const paragraph = 'A paragraph with fairly plain words in it.\n\nsecond\n';
  const plain = await count(paragraph, 'fairly', ['x']);
  check('a plain keystroke asks no parse', plain.calls.length === 0, plain.calls);
  check('a plain keystroke keeps the block', plain.sameBlock, plain.sameBlock);

  const structural = await count(paragraph, 'fairly', [' ']);
  check('a structural keystroke parses its block', structural.calls.length >= 1, structural.calls);
  check('a structural keystroke rebuilds the block', !structural.sameBlock, structural.sameBlock);

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
```

Run: `npm run probe -- test/probes/plain-edit-parse.js`

Expected: `failed: []` — no calls while typing a letter, at least one while typing a
space. Before this task the plain one reports two calls
(`sourceRangeAt>showSourceAt>restoreCaret` and `…>followCaret`).

- [ ] **Step 3: Run the probes this touches**

One at a time, with `--fixture default-document.md`: `typed-text`,
`plain-edit-offsets`, `boundary-caret`, `pointer`, `regression-arrows`,
`revealable-flows`, `display-math-source`, `display-math-arrows`,
`inline-math-source`, `math-source-caret`, `revealed-source-exit`,
`empty-line-editing`, `edit-stability`, `undo-after-scroll`.

Expected: the same results as before this task, `failed: []` where they report it.

- [ ] **Step 4: Commit**

```bash
git add src/ui/markdown/editing/context.ts test/probes/plain-edit-parse.js
git commit -m "refactor(render): a plain keystroke does not parse its block"
```

### Task 4: The number, the docs, and the acceptance

**Files:**
- Modify: `test/README.md` (the probe index)
- Modify: `docs/architecture.md` ("One keystroke")
- Modify: `docs/superpowers/plans/2026-09-23-keystroke-without-parse.md` (the handoff)

- [ ] **Step 1: Read the keystroke cost before and after**

Run:

```bash
npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" \
  test/probes/block-rebuild-cost.js
```

Expected: `keystrokePath.plain: 'fast'` and `medianMs.plainKeystroke` **below the
11 ms** P7 recorded at the same caret — the parse is 8 ms of it. If it has not
moved, check `keystrokePath.plain` before blaming the change.

- [ ] **Step 2: The index and the sentence**

`test/README.md`: seventy-one probes become seventy-two, and `plain-edit-parse`
joins the group listing what a keystroke costs.

`docs/architecture.md`, in "One keystroke": after the paragraph about the plain
write, say that a plain keystroke parses nothing — the source the caret is in cannot
have changed (the property in `test/checks/check-plain-edit.mjs`), so the decision
is held and the shown range is moved with the edit instead of re-decided, while the
ordinary path and the deferred check keep the parses they need.

- [ ] **Step 3: Acceptance**

```bash
npx tsc --noEmit
npm run check                                   # 19/19 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 66/66 probes, 6 skipped
```

- [ ] **Step 4: The handoff, and the commit**

Append to this plan: what changed, the numbers (the parse calls per keystroke, the
plain keystroke on the fixture note before and after, the check and probe counts),
and what is left — the ordinary path's parse, deriving the parse, spaces with
destinations and URLs, lazy block offsets, the footnote gap.

```bash
git add test/README.md docs/architecture.md docs/superpowers/plans/2026-09-23-keystroke-without-parse.md
git commit -m "docs: close the parse handoff"
```

- [ ] **Step 5: Merge**

```bash
git checkout main
git merge --no-ff codex/keystroke-without-parse -m "merge: a plain keystroke parses nothing (caret lookup)"
git rev-parse HEAD^{tree} codex/keystroke-without-parse^{tree}   # must be equal
```

Keep the branch, and report the tree hash.

---

## Handoff, 2026-09-23 — the fast path parses nothing

**What changed.** `applyEdit`'s fast path no longer resolves the source the caret is
in. That lookup (`sourceRangeAt`, through `showSourceAt`) was the only parse a plain
keystroke paid, and it paid it once a keystroke: after a write the block's text is a
new content key, so the parse was a miss every time. The decision is now held while
the caret is placed (`source_mode.ts: withHeldShownSource`, which `showSourceAt`
honours), and the shown range is moved with the edit by
`source_mode.ts: moveShownSource` — `syntax/edit_range.ts: shiftOffset`, the rule the
block's tags already move by. The ordinary path and the deferred check keep deciding
from the parse, and the parse they read is the one their rebuild renders from.

**The numbers.** `test/probes/block-rebuild-cost.js` on the fixture note's last
block (4760 characters, 41 lines, 189 elements), same caret as P7's measurement:

| What | P7 | Now |
| --- | --- | --- |
| a plain keystroke (a letter inside a word) | 11 ms | **4 ms** |
| a structural keystroke (a space, the same caret) | 42 ms | 40 ms — unchanged, and it is the ordinary path |
| that block's parse, measured in the same run | 8–10 ms | 9 ms (still what the ordinary path and the check pay) |
| geometry reads per plain keystroke | 1 height, no rect | the same |

`test/probes/plain-edit-parse.js` reports it by caller: a burst of letters asks
`scheduleVerify` once (the shape capture, a cache hit) and `verifyBlock` once (the
burst's single parse) and never asks `sourceRangeAt`; typing a space asks the lookup,
parses, and builds the block again.

**What the checks pin.** `check-plain-edit.mjs` now checks, against the editor's own
parse (`document/state.ts`, block by block), that an edit the rule accepts leaves the
caret in a node of the same type path — the property the skip rests on, over the
corpus's 530 accepted edits. `check-math-source.mjs` checks that the shown range
moves with an edit: a deletion inside a block that shows its own text used to push
the range past the block, which would bring a formula back as KaTeX the next time it
was built without a fresh decision. Acceptance: `npx tsc --noEmit` clean, `npm run
check` 19/19, a freshly started app and `npm run probe:all` **66/66 (6 skipped)**.

**What is left.**

- **The ordinary path's parse.** A structural keystroke still parses its block once
  (40 ms on the fixture note's last block, of which the parse is 9 ms), because the
  rebuild renders from it. Making that cheaper is a parser measurement, not a caret
  one.
- **Deriving the parse.** A plain edit could produce the new tree from the old one
  (positions shifted, the leaf rewritten) and cache it under the new content key, so
  that every consumer is free — at the cost of a cache whose entries the parser did
  not produce, and a deferred check that would have to parse freshly to stay a check.
- **Spaces.** The rule refuses them, which costs one ordinary re-render per word;
  extending it needs link destinations and bare URLs handled first.
- **Lazy block offsets.** Deferred, with the reason in the block-rendering phase's
  §1.4: line numbers are what the renderer, the caret tags and `getBlockAtLine` key
  on, so laziness needs stable line handles first.
- **The footnote gap.** A footnote reference cannot be clicked into and edited today;
  that is a small feature of its own.
