# Spaces in the Plain-Edit Rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a typed space is written into the text node like a letter — no rebuild, no
parse — wherever the space is prose, and refused wherever it is markdown's.

**Architecture:** the rule (`syntax/plain_edit.ts`) keeps every guard it has and
allows a single space only when the runs of text on *both* sides of the edit are
words: left alone, a space before a URL-ish run creates an autolink (`seehttps://x` →
`see https://x`) and a space inside a URL host shortens a link. The gate is the
property in `test/checks/check-plain-edit.mjs`, strengthened first: not "the node
types stay the same" — a link whose extent changed has the same types — but "the new
parse is the old parse with the edit applied where it lands, and every other node's
source is the source it had".

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** this document's part 1. `docs/roadmap.md` item 1; the rule it extends is
documented in `docs/superpowers/plans/2026-09-23-incremental-block-rendering.md`
§1.2 and `2026-09-23-keystroke-without-parse.md`.

## Global Constraints

- **Behaviour is preserved.** The same edits produce the same text, the same blocks,
  the same rendered content and the same caret offset; what changes is who renders.
- **The offsets do not move.** `getText()`, `getBlocks()`, `getBlockAtOffset`,
  `getBlockAtLine`, `getBlockContent`, `historyEdits()`, `undo`, `redo` and
  `loadText` keep their signatures and their meaning.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` stays green
  (72 probes, 6 skipped → 66/66).
- Commit style: `test(…): …`, `refactor(…): …`, `docs: …`, and a `merge:` commit.

---

## Part 1 — the design

### 1.1 What this buys

`test/probes/block-rebuild-cost.js` on the fixture note's last block (4760
characters, 189 elements): a letter inside a word is **4 ms** (P9), a space at the
same caret is **40 ms** — 27 ms of rebuild and 9 ms of parse — so prose in a long
paragraph rebuilds at every word boundary. This makes the space the 4 ms path.

### 1.2 What the guards already cover, and the hole

The word guard — the run the edit leaves behind must be letters — already refuses a
space inside a bare URL, inside `[title](dest)` without spaces, inside `[^label]`,
inside an entity, and inside a marker: those runs hold punctuation. The neighbour
guard refuses the joins that matter (`# heading` → `#heading`, `- item` → `-item`, a
space beside `*`). The line-edge guard is what keeps out the two constructs a space
can open: an indented code block and a hard break (two trailing spaces).

The hole is the right-hand side, which nothing looks at. Measured over the check's
corpus at every position with a throwaway script:

| Rule | accepted | edits that are not "the old parse plus this edit" |
| --- | --- | --- |
| today | 172 | **0** |
| spaces, today's guards | 356 | **5** — a space inside `https://example.com`, and the glued-URL case |
| spaces, with the right-hand run required | 336 | **0** |

### 1.3 Not this phase

Punctuation, digits, tabs and newlines stay refused: a full stop, a comma, a quote or
a digit can open or close something (`1.` a list, `.` a URL, `"` a title). They keep
the ordinary path, and `block-rebuild-cost.js` keeps measuring one of them.

---

## Part 2 — tasks

### Task 1: The gate — a property that can see extents

**Files:**
- Modify: `test/checks/check-plain-edit.mjs`

**Interfaces:**
- Consumes: `document/state.ts` (`MarkdownEditorState`), already loaded there.
- Produces: nothing; this is the gate Task 2 has to satisfy.

- [ ] **Step 1: Replace the caret-node property with the source property**

Delete `nodePathAt` (the P9 property) and add:

```js
/** Every node of the block an offset sits in, with the source it covers. */
const nodesOf = (state, offset) => {
  const block = state.getBlockAtOffset(offset);
  if (!block) {
    return null;
  }
  const list = [];
  const walk = (nodes, path) => {
    for (const node of nodes) {
      const start = block.charStart + (node.position?.start?.offset ?? 0);
      const end = block.charStart + (node.position?.end?.offset ?? 0);
      list.push({
        path: `${path}>${node.type}`,
        start,
        end,
        source: state.getText().slice(start, end)
      });
      if (Array.isArray(node.children)) {
        walk(node.children, `${path}>${node.type}`);
      }
    }
  };
  walk(state.getBlockContent(block), block.kind);
  return list;
};

/**
 * The property the fast path trusts: the new parse is the old one with the edit
 * applied where it lands. Node types are what the renderer draws and a node's source
 * is what it holds, so comparing both catches what types alone cannot — a link whose
 * extent changed (`seehttps://x` → `see https://x`) has the same types. A node the
 * edit never reached keeps the source it had; a boundary offset belongs to one leaf
 * or the other, so a node satisfying either form is accepted.
 */
const derivable = (before, after, from, to, inserted) => {
  const one = nodesOf(new MarkdownEditorState(before), from);
  const other = nodesOf(new MarkdownEditorState(after), from + inserted.length);
  if (!one || !other || one.length !== other.length) {
    return false;
  }
  for (let index = 0; index < one.length; index += 1) {
    if (one[index].path !== other[index].path) {
      return false;
    }
    const applied =
      one[index].start <= from && from <= one[index].end
        ? one[index].source.slice(0, from - one[index].start) +
          inserted +
          one[index].source.slice(from - one[index].start + (to - from))
        : null;
    if (other[index].source !== one[index].source && other[index].source !== applied) {
      return false;
    }
  }
  return true;
};
```

and, in the walk loop where the accepted edits are counted:

```js
        if (!derivable(before, after, from, to, inserted)) {
          failures.push(
            `the rule accepted an edit that is not the parse with that edit in it\n` +
              `  before ${JSON.stringify(before)}\n  edit ${JSON.stringify({ from, to, inserted })}\n` +
              `  after ${JSON.stringify(after)}`
          );
        }
```

- [ ] **Step 2: Add the constructs the space rule has to refuse to the corpus**

```js
  'see https://example.com and seehttps://glued.example now\n',
  'a link to [the title](https://example.com/dest) and [t](<the dest>)\n',
  'a double  space, a footnote label [^label] and its definition\n\n[^label]: note\n',
```

- [ ] **Step 3: Break the space out of the refusal cases (RED)**

```js
check('a single space is plain', isPlainEdit('a quick fox', 3, 3, ' '), true);
check('a space inside a URL is not plain', isPlainEdit('see https://example.com now', 15, 15, ' '), false);
check('a space before a glued URL is not plain', isPlainEdit('seehttps://x.example', 3, 3, ' '), false);
check('a second space in a row is not plain', isPlainEdit('a  b', 2, 2, ' '), false);
check('deleting the space between two words is plain', isPlainEdit('two words', 3, 4, ''), true);
```

- [ ] **Step 4: Run it**

Run: `node test/checks/check-plain-edit.mjs`

Expected: FAIL on `a single space is plain` and on `deleting the space between two
words is plain` (the rule refuses spaces today); the property itself passes, which is
the point — it is a gate the current rule already satisfies.

- [ ] **Step 5: Commit**

```bash
git add test/checks/check-plain-edit.mjs
git commit -m "test(syntax): hold the rule to the parse with its edit in it"
```

### Task 2: The rule accepts a single space between words

**Files:**
- Modify: `src/ui/markdown/syntax/plain_edit.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the same `isPlainEdit(before, from, to, inserted): boolean`, over a wider
  set of edits.

- [ ] **Step 1: Widen the character set, and say why**

```ts
/**
 * What a plain edit may consist of: letters, and the single space between them.
 *
 * Every markdown construct that a typed character could open or close needs
 * something that is not a letter and is not the space inside a line — the `*` of an
 * emphasis, the `[]()` of a link, the `` ` `` of code, the `#` or a line edge of a
 * heading, the `-` or digit of a list, the `|` of a table, the `.` and `:` and `/`
 * of a URL, the `&` of an entity, the `-=` of a setext underline, the `$` of math,
 * the `<>` of HTML. The two constructs a space can open are line edges — the two
 * trailing spaces of a hard break and the four that begin an indented code block —
 * and the rule refuses a line edge outright.
 */
const PLAIN = /^[\p{L} ]*$/u;
```

- [ ] **Step 2: Guard the run on the right, and the run of spaces**

```ts
/** The run of characters from `at` up to the next whitespace. */
function runAfter(text: string, at: number): string {
  let end = Math.max(0, Math.min(at, text.length));
  while (end < text.length && !/\s/.test(text[end])) {
    end += 1;
  }
  return text.slice(at, end);
}

/** The run of spaces touching `at` on either side. */
function spacesAt(text: string, at: number): string {
  let start = at;
  let end = at;
  while (start > 0 && text[start - 1] === ' ') {
    start -= 1;
  }
  while (end < text.length && text[end] === ' ') {
    end += 1;
  }
  return text.slice(start, end);
}
```

In `isPlainEdit`, where the word and the neighbours are checked:

```ts
  const after = `${before.slice(0, from)}${inserted}${before.slice(to)}`;
  // The runs the edit lands between. One guard is not enough for a space: a space
  // glued to a URL on its right turns the run into an autolink (`seehttps://x` →
  // `see https://x`) and the parse changes under the caret.
  if (!isPlainText(wordAt(after, from))) {
    return false;
  }
  if (!isPlainText(runAfter(after, from + inserted.length))) {
    return false;
  }
  // A run of two spaces does not render as the characters say (`nodes/text.ts:
  // preserveSpaces` turns the second into a no-break space), so writing one in would
  // put the DOM out of step with the document.
  if (/ {2}/.test(inserted) || spacesAt(after, from).length > 1) {
    return false;
  }
```

The existing word guard keeps its own comment, with `wordAt` described as the run to
the *left* of a space the edit inserted.

- [ ] **Step 3: Run it**

Run: `node test/checks/check-plain-edit.mjs`

Expected: `plain edit: all checks passed (… accepted edits)` — the count grows by the
spaces the walk now accepts, and the property stays green. If it fails, the missing
guard is the one the failure names.

- [ ] **Step 4: Commit**

```bash
git add src/ui/markdown/syntax/plain_edit.ts
git commit -m "refactor(syntax): a single space between words cannot change a parse"
```

### Task 3: The probes that spoke about spaces

**Files:**
- Modify: `test/probes/typed-text.js`
- Modify: `test/probes/plain-edit-parse.js`
- Modify: `test/probes/block-rebuild-cost.js`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing; the numbers move.

- [ ] **Step 1: `typed-text.js`: a space is now the fast path**

Replace `out.structuralSpace` with a space case and a punctuation case, and update
the header's "an asterisk, a space" to "an asterisk, a full stop":

```js
  out.plainSpace = await typeAt(paragraph, inWord('plain', 2), [' ']);
  check('a space keeps the block', out.plainSpace.blockSurvived);
  check('a space keeps the text node', out.plainSpace.textNodeSurvived);
  check('a space reaches the document', showsDocument(out.plainSpace));
  check('a space reads no rect', out.plainSpace.reads.rects === 0);

  out.structuralFullStop = await typeAt(paragraph, inWord('plain', 2), ['.']);
  check('a full stop rebuilds the block', !out.structuralFullStop.blockSurvived);
  check('a full stop reaches the document', showsDocument(out.structuralFullStop));
```

- [ ] **Step 2: `plain-edit-parse.js`: the structural key becomes a full stop**

`count('fairly', [' '])` becomes `count('fairly', ['.'])`, its expected document
becomes `'A paragraph with fai.rly plain words in it.\n\nsecond\n'`, and the header's
"typing a space asks the lookup, parses, and builds the block again" becomes "typing
a full stop …".

- [ ] **Step 3: `block-rebuild-cost.js`: a space column of its own**

```js
  const plain = await timeKeystrokes('x', 10);
  const space = await timeKeystrokes(' ', 6);
  const structural = await timeKeystrokes('.', 6);
```

with `out.medianMs = { …, plainKeystroke: plain.medianMs, spaceKeystroke:
space.medianMs, structuralKeystroke: structural.medianMs }`,
`out.keystrokePath = { plain: plain.path, space: space.path, structural:
structural.path }`, and `perKeystrokeReads` likewise. The header's "a letter typed
inside a word, which the fast path writes … and a space, which the ordinary path
renders" becomes "a letter, a space, and a full stop".

- [ ] **Step 4: Run all three, and read the numbers**

```bash
npm run probe -- test/probes/typed-text.js
npm run probe -- test/probes/plain-edit-parse.js
npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" test/probes/block-rebuild-cost.js
```

Expected: `failed: []` for the first two; the third reporting `keystrokePath.space:
'fast'` with `medianMs.spaceKeystroke` near `plainKeystroke` (4 ms) and
`structuralKeystroke` near 40 ms. Report the numbers in the handoff.

- [ ] **Step 5: Commit**

```bash
git add test/probes/typed-text.js test/probes/plain-edit-parse.js test/probes/block-rebuild-cost.js
git commit -m "test(render): say which keystrokes a space has joined"
```

### Task 4: Acceptance, docs, handoff

**Files:**
- Modify: `docs/architecture.md` ("One keystroke")
- Modify: `docs/adding-a-node.md` (step 6)
- Modify: `docs/roadmap.md` (close item 1)
- Modify: `docs/superpowers/plans/2026-09-23-spaces-in-plain-edits.md` (handoff)

- [ ] **Step 1: The docs**

`docs/architecture.md`: the rule's sentence becomes "the rule accepts letters and
single spaces, where no marker, line edge or setext underline could change what the
line means and where the runs on both sides of the edit are words".

`docs/adding-a-node.md` step 6: the assumption becomes "every construct needs a
character that is not a letter — or, for the two a space can open, an indented code
block and a hard break, a space at a line edge, which the rule refuses"; and the
bullet about the word guard becomes the guard on the runs on both sides of the edit.

`docs/roadmap.md`: item 1 moves to Closed, with the numbers.

- [ ] **Step 2: Acceptance**

```bash
npx tsc --noEmit
npm run check                                   # 19/19 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 66/66 probes, 6 skipped
```

- [ ] **Step 3: The handoff, and the commit**

Append to this plan: what changed, the numbers (the space keystroke before and after
on the fixture note's last block, the corpus counts the property accepted, what the
rule still refuses), and what is left (the ordinary path's parse for punctuation and
digits, the line index, undo ergonomics, the footnote gap).

```bash
git add docs/architecture.md docs/adding-a-node.md docs/roadmap.md docs/superpowers/plans/2026-09-23-spaces-in-plain-edits.md
git commit -m "docs: close the space handoff"
```

- [ ] **Step 4: Merge**

```bash
git checkout main
git merge --no-ff codex/plain-edit-spaces -m "merge: write a space, like a letter (plain-edit spaces)"
git rev-parse HEAD^{tree} codex/plain-edit-spaces^{tree}   # must be equal
```

Keep the branch, and report the tree hash.
