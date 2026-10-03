# Typing Through an Input Method — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** the reader's ask — *"new feature: I couldn't type characters as Chinese."* Typing through
the system's input method — Chinese, Japanese, Korean, and the Latin keyboards with dead keys — and
through dictation and the emoji panel, lands in the document the way typed characters do.

**Architecture:** one invisible `<textarea>` inside the scroller holds the keyboard whenever the
editor has the caret, so the system has a real place to compose; the `keydown` text path does not
move, and only what it does not handle reaches the seam. What the system commits is inserted through
a sibling of `insertText` as one edit of kind `other` — the "step of its own" `history.ts` already
describes — and the page shows nothing of the composition, which is the reader's own answer.

**Tech Stack:** TypeScript, Tauri v2 (WKWebView), daisyUI/Tailwind for the one CSS rule, the
repo's own probe harness over the Tauri MCP bridge, and Node checks for anything pure.

**Spec:** `docs/superpowers/specs/2026-10-03-input-method-typing-design.md` — the plan argues from
it, so read both. Where this plan and the spec differ, this plan says so in the task.

## Global Constraints

- **The house rules hold**: `npx tsc --noEmit` silent, `npm run check` green (it includes
  `headers.mjs` — every new module under `src/ui/markdown` opens with what it is for, what it may
  import, what it upholds — and `layering.mjs`, which keeps `syntax/` pure).
- **Probes drive the running app**, never a browser: `npm run tauri dev` in one terminal,
  `npm run probe -- test/probes/<name>.js` in another. A probe is one expression returning
  `{ checks, failed }`, and the bridge gives it **5 s** — split a probe that needs longer.
- **The document text is the only source of truth**: nothing is written while a word is composing,
  and what commits is the system's own text, once.
- **Commit style**: `type(scope): subject`, lower case, imperative.
- **A behaviour change needs a test that fails without it**, and the commit says which one.
- **One fact, one home**: the seam is the only place that knows about the system's text input, and
  it is the only element in the window that may hold the keyboard while the editor has the caret.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/ui/markdown/editing/composition_input.ts` (create) | The seam: the invisible textarea, the focus rule, the caret placement, and what commits |
| `src/ui/markdown/editing/text_commands.ts` (modify) | One text path (`insertAt`), `insertText` and the new `insertCommitted` |
| `src/ui/markdown/markdown_editor.ts` (modify) | Installs the seam and hands it `insertCommitted` |
| `src/styles.css` (modify) | The seam's one rule: invisible but focusable, where the caret is |
| `src/ui/floating/surface.ts` (modify) | Escape while composing is the input method's, not the surface's |
| `test/probes/input-method.js` (create) | The seam, the commit, one undo, dictation |
| `test/probes/input-method-blocks.js` (create) | A committed word in a paragraph, a heading, a list item |
| `test/probes/input-method-literals.js` (create) | A committed word in a table cell, a code block, an empty display formula |
| `test/probes/input-method-escape.js` (create) | A cancelled composition does not also close a message card |
| `test/README.md`, `docs/architecture.md`, `docs/ai-context.md` (modify) | The index and the two maps that name the seam |

---

### Task 1: The seam, and the keyboard goes to it

**Files:**
- Create: `src/ui/markdown/editing/composition_input.ts`
- Modify: `src/styles.css` (the seam's rule, beside the other `.markdown-…` rules)
- Modify: `src/ui/markdown/markdown_editor.ts` (the constructor, after the `paste` listener)
- Test: `test/probes/input-method.js` (new)
- Modify: `test/README.md` (the probe index)

**Interfaces:**
- Consumes: `caret/caret.ts: getCaretRange`, `onCaretRangeChanged`; `caret/geometry.ts: caretRect`;
  the editor's `contentView` (the scroller).
- Produces: `installCompositionInput(host: HTMLElement, onCommit: (text: string) => void): CompositionInput`,
  where `CompositionInput = { readonly element: HTMLTextAreaElement }`, and the element's class
  `markdown-composition-input`.

**The spec, corrected here:** the spec's interface lists a `composing()` query, and its element is
`position: absolute`. Neither survives contact: the app's key path and the escape guard read the
*event's* own `isComposing`, so the seam needs no query, and a fixed box placed from the caret's own
client rectangle needs no containing block (`absolute` inside the scroller would anchor to the
editor's outer element, since the scroller is not positioned).

- [x] **Step 1: Write the failing probe**

```js
/**
 * Typing through an input method: the editor hands the keyboard to a seam the system
 * can compose into, and what commits lands in the document as one word.
 *
 * A `keydown` path can only ever see one character per key, so the system has nowhere
 * to compose a Chinese, Japanese or Korean word — and dictation and the emoji panel
 * have nowhere to arrive. The seam is an invisible textarea that holds the keyboard
 * while the caret is in the editor; this probe checks what a browser can see of it:
 * an editable element has the focus, it sits where the caret is, and the keys the
 * editor handles never reach it.
 *
 * @covers src/ui/markdown/editing/composition_input.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const seam = () => document.querySelector('.markdown-composition-input');

  await t.load('hello world\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);

  check('the seam is a textarea', seam()?.tagName ?? null, 'TEXTAREA');
  check('and it holds the keyboard', document.activeElement === seam(), true);

  const caret = t.caretRect();
  const box = seam()?.getBoundingClientRect() ?? null;
  check('it sits on the caret’s own line',
    caret !== null && box !== null && Math.abs(box.top - caret.y) <= 6,
    true);

  t.key('x');
  t.key('y');
  await t.sleep(250);
  check('the editor still takes the keys', await t.raw(), 'hello worldxy\n');
  check('and the seam stays empty', seam()?.value ?? null, '');

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
```

- [x] **Step 2: Run it and watch it fail**

Run: `npm run probe -- test/probes/input-method.js`
Expected: FAIL — `the seam is a textarea` reports `null` (there is no such element anywhere in the
window; the measured state is in the spec's Problem section).

- [x] **Step 3: Write the seam**

```ts
/**
 * The keyboard's way in that is not a keystroke: an input method composing a word,
 * dictation, the emoji panel.
 *
 * The text path reads characters out of `keydown`, which is right for a keyboard that
 * sends one character per key and useless for one that composes. So one invisible
 * textarea sits inside the scroller and holds the keyboard while the editor has the
 * caret: the system composes into it, its events bubble to the listeners the editor
 * already has on the scroller, and every key the editor handles is still
 * `preventDefault`ed — which is what keeps its value empty until the system puts a
 * word there. `compositionend`, and an `input` that is not part of a composition,
 * hand that word to the caller, which writes it into the document as one edit
 * (`text_commands.ts: insertCommitted`).
 *
 * May import: the caret (`caret/caret.ts`, `caret/geometry.ts`). Upholds: the document
 * text is the only source of truth — nothing is written while a word is being
 * composed, and what commits is the system's own text, once.
 */

import { getCaretRange, onCaretRangeChanged } from '../caret/caret';
import { caretRect } from '../caret/geometry';

/** What the editor holds while the seam's element is in the DOM. */
export interface CompositionInput {
  /** The element that holds the keyboard. The editor focuses it, and nothing else may. */
  readonly element: HTMLTextAreaElement;
}

/** The controls whose focus is their own: a field of the app's, never the page's. */
const CONTROLS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/**
 * Puts the seam in `host` (the scroller) and reports what committed.
 *
 * The element is parked off to the side until there is a caret to sit on, and follows
 * the caret from then on — a caret change and a scroll both move it, because the
 * system's candidate window opens where the element is.
 */
export function installCompositionInput(
  host: HTMLElement,
  onCommit: (text: string) => void
): CompositionInput {
  const element = document.createElement('textarea');
  element.className = 'markdown-composition-input';
  element.setAttribute('tabindex', '-1');
  element.setAttribute('aria-hidden', 'true');
  element.setAttribute('autocapitalize', 'off');
  element.setAttribute('autocorrect', 'off');
  element.setAttribute('spellcheck', 'false');
  host.appendChild(element);

  let composing = false;

  /** Takes the value the system left and hands it over; an empty one commits nothing. */
  const commit = () => {
    const text = element.value;
    element.value = '';
    if (text !== '') {
      onCommit(text);
    }
  };

  element.addEventListener('compositionstart', () => {
    composing = true;
  });
  element.addEventListener('compositionend', () => {
    composing = false;
    commit();
  });
  // Dictation, the emoji panel and a system autocorrection arrive as an `input` with
  // no composition behind it. The `input` that follows a commit finds the value the
  // commit already took, so a word is never inserted twice.
  element.addEventListener('input', () => {
    if (!composing) {
      commit();
    }
  });

  // The keyboard belongs here whenever it is in the editor: a click puts the caret in
  // the page, `focusText` hands it back after a mode laid over the editor — and both
  // mean this element. A control keeps its own focus.
  host.addEventListener('focusin', (event) => {
    const target = event.target;
    if (target === element || (target instanceof Element && target.matches(CONTROLS))) {
      return;
    }
    element.focus({ preventScroll: true });
  });

  /** Where the system should open its candidate window: the caret's own box. */
  const followCaret = () => {
    const range = getCaretRange();
    const box = range ? caretRect(range) : null;
    if (!box) {
      element.style.left = '-1000px';
      element.style.top = '-1000px';
      return;
    }
    element.style.left = `${box.left}px`;
    element.style.top = `${box.top}px`;
    element.style.height = `${box.height}px`;
  };
  onCaretRangeChanged(followCaret);
  host.addEventListener('scroll', followCaret);
  followCaret();

  return { element };
}
```

- [x] **Step 4: Give it its one rule**

Add to `src/styles.css`, beside the other `.markdown-…` rules (for instance after
`.markdown-empty-line-placeholder`):

```css
/* The seam the system's text input goes through (see `composition_input.ts`). It is
   invisible, but it must be a real, focusable box: an input method can only compose
   into an editable element, and its candidate window opens where that element is —
   which is why the module moves this one to the caret. `pointer-events: none` keeps
   a click from ever landing in it. */
.markdown-composition-input {
  position: fixed;
  width: 1px;
  min-height: 1px;
  padding: 0;
  border: 0;
  opacity: 0;
  resize: none;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
```

- [x] **Step 5: Install it in the editor**

In `src/ui/markdown/markdown_editor.ts`, add the import beside the other `editing/*` imports:

```ts
import { installCompositionInput, type CompositionInput } from './editing/composition_input';
```

and, in the constructor, after `this.contentView.addEventListener('paste', …)`. Task 1 hands the
seam the *ordinary* typing path, so the seam stands on its own; Task 2 swaps in `insertCommitted`,
which is the difference between a commit and a run of typing:

```ts
    // The system's way in: an input method's word, dictation and the emoji panel get
    // something to compose and arrive in (see `editing/composition_input.ts`).
    this.composition = installCompositionInput(this.contentView, (text) => {
      insertText(this.context, text);
    });
```

with the field beside the other fields, and `insertText` added to the existing
`./editing/text_commands` import:

```ts
  /** The system's text input seam; it holds the keyboard while the caret is here. */
  private readonly composition: CompositionInput;
```

The spec's measured note — that the seam's own selection never appears in `window.getSelection()`,
so no selection bookkeeping has to learn about it — asks for no code: it is the reason this task can
be this small.

- [x] **Step 6: Run the probe again**

Run: `npm run probe -- --reload && sleep 5 && npm run probe -- --install && npm run probe -- test/probes/input-method.js`
Expected: PASS — five checks. (`--reload` is what a fresh module needs: HMR updates the page's
imports but not the editor instance that already holds its closures.)

- [x] **Step 7: Types, checks, and the index**

Run: `npx tsc --noEmit && npm run check`
Expected: silent, then `40/40 checks passed` — `headers.mjs` is the one that cares about the new
module's opening comment.

Add to `test/README.md`'s probe list, beside the other editing probes:

```
`input-method.js` — an input method's word, dictation and the emoji panel land in the
document because an invisible textarea holds the keyboard where the caret is
```

- [x] **Step 8: Commit**

```bash
git add src/ui/markdown/editing/composition_input.ts src/styles.css src/ui/markdown/markdown_editor.ts test/probes/input-method.js test/README.md
git commit -m "feat(editor): an invisible seam the system's input can compose into"
```

---

### Task 2: The committed word

**Files:**
- Modify: `src/ui/markdown/editing/text_commands.ts` (one text path, and `insertCommitted`)
- Modify: `src/ui/markdown/markdown_editor.ts` (hand the seam `insertCommitted`)
- Test: `test/probes/input-method.js` (extended)
- Modify: `docs/architecture.md` (the "One keystroke" step 1), `docs/ai-context.md`

**Interfaces:**
- Consumes: `materializeInsertion` and `mathTypedWrite` (already imported in this file).
- Produces: `insertCommitted(context: EditorContext, text: string): boolean`.

- [x] **Step 1: Extend the probe with the commit**

Add to `test/probes/input-method.js`, before the `return`:

```js
  // A Chinese word, the way the system delivers one: the value is set as it is chosen,
  // then committed. (A dispatched CompositionEvent carries no text of its own, so the
  // probe writes the value the browser would have.)
  const area = seam();
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  area.value = 'ni';
  area.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'ni', bubbles: true }));
  area.value = '你';
  area.dispatchEvent(new CompositionEvent('compositionend', { data: '你', bubbles: true }));
  await t.sleep(250);
  check('the committed word lands at the caret', await t.raw(), 'hello worldxy你\n');
  check('and the seam gives its text up', area.value, '');

  // One undo takes the word, and only the word: the commit is a step of its own.
  await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'undo' });
  await t.sleep(300);
  check('one undo takes the committed word back', await t.raw(), 'hello worldxy\n');

  // Dictation and the emoji panel arrive as an `input` with no composition at all.
  area.value = '好';
  area.dispatchEvent(new InputEvent('input', { data: '好', inputType: 'insertText', bubbles: true }));
  await t.sleep(250);
  check('a dictated word lands the same way', await t.raw(), 'hello worldxy好\n');
```

- [x] **Step 2: Run it and watch it fail**

Run: `npm run probe -- test/probes/input-method.js`
Expected: FAIL on the last two checks only — the word lands, because Task 1 already hands the seam
the ordinary typing path, but `one undo takes the committed word back` reports `hello world\n`: a
commit recorded as `typing` is one run with the `xy` typed before it, which is exactly what
`history.ts` says must not happen to a word the system commits.

- [x] **Step 3: One text path, and the commit**

In `src/ui/markdown/editing/text_commands.ts`, replace `insertText`'s body with a call to a shared
`insertAt`, and add `insertCommitted` beside it:

```ts
/** Inserts typed text at the caret, replacing any selection. */
export function insertText(context: EditorContext, text: string): boolean {
  return insertAt(context, text, true);
}

/**
 * Inserts a word the system committed — an input method, dictation, the emoji panel.
 *
 * The block's own rules are the ones typing follows: an empty paragraph materializes
 * its line, a display formula's content gets a line of its own. What it does not do is
 * pair a bracket: the characters are the author's own text, and a `]` the app added
 * around them would be a second editor's opinion. And its edit is not `typing`, which
 * is what makes one undo take the whole word (`history.ts`: a multi-character
 * insertion is a step of its own).
 */
export function insertCommitted(context: EditorContext, text: string): boolean {
  return insertAt(context, text, false);
}

/** The one text path: the block's rules first, then a bracket's pair or the text. */
function insertAt(context: EditorContext, text: string, brackets: boolean): boolean {
  const range = editorSelection(context, true);
  if (!range) {
    return false;
  }
  const offsets = rangeOffsets(context, range);
  if (!offsets) {
    return false;
  }
  const block = context.state.getBlockAtOffset(offsets.from);
  if (block?.kind === 'blank' && offsets.from === offsets.to) {
    return materializeInsertion(context, offsets, text);
  }
  // A character typed at either edge of a display formula's content belongs *in*
  // the content: written where the caret is, it would land on a `$$` line, which
  // the parser reads as a different formula altogether (see `syntax/math_edits.ts`).
  if (block?.kind === 'displayMath' && offsets.from === offsets.to) {
    const write = mathTypedWrite(block.text, offsets.from - block.charStart, text);
    if (write) {
      applyEdit(
        context,
        block.charStart + write.from,
        block.charStart + write.to,
        write.replacement,
        block.charStart + write.caret,
        'typing'
      );
      return true;
    }
  }
  // A bracket writes its pair where prose is being written — not inside a code block or a
  // formula, where the characters are the author's source (`syntax/brackets.ts`).
  if (brackets && offsets.from === offsets.to) {
    const literal = block?.kind === 'fencedCode' || block?.kind === 'displayMath';
    const source = context.state.getText();
    if (skipClosingFor(source, offsets.from, text, literal)) {
      // The author typed the bracket they can see: they move past it rather than writing another.
      placeCaret(context, offsets.from + 1);
      return true;
    }
    const pair = pairingFor(source, offsets.from, text, literal);
    if (pair) {
      applyEdit(context, pair.from, pair.to, pair.insert, pair.caret, 'typing');
      return true;
    }
  }
  applyEdit(context, offsets.from, offsets.to, text, undefined, brackets ? 'typing' : 'other');
  return true;
}
```

- [x] **Step 4: Hand the seam the commit**

In `src/ui/markdown/markdown_editor.ts`, change the seam's callback from `insertText` to
`insertCommitted`:

```ts
    this.composition = installCompositionInput(this.contentView, (text) => {
      insertCommitted(this.context, text);
    });
```

and import it:

```ts
import { insertCommitted } from './editing/text_commands';
```

(If Task 1 imported `insertText` for the same call, replace that import rather than adding a second.)

- [x] **Step 5: Run the probe again**

Run: `npm run probe -- --reload && sleep 5 && npm run probe -- --install && npm run probe -- test/probes/input-method.js`
Expected: PASS — all nine checks; the probe must stay inside the bridge's five seconds (it does, by
about half).

- [x] **Step 6: Types and checks**

Run: `npx tsc --noEmit && npm run check`
Expected: silent, then `40/40 checks passed`.

- [x] **Step 7: The two maps**

In `docs/architecture.md`, in the "One keystroke" list, step 1 becomes:

```
1. `markdown_editor.ts` sees the key and calls a command (`editing/*`). The keyboard
   is held by an invisible textarea (`editing/composition_input.ts`), so a key can also
   arrive as a composition: what the system commits is inserted through the same path
   as typing, as one edit of its own (`text_commands.ts: insertCommitted`).
```

In `docs/ai-context.md`, in the paragraph that ends the editor's map (after the sentence about the
completions owning the arrows), add:

> Typing is not only keystrokes: an input method, dictation and the emoji panel go through
> `editing/composition_input.ts`, an invisible textarea that holds the keyboard where the caret is,
> and what it commits is inserted by `text_commands.ts: insertCommitted` as one step of its own.
> Nothing of a composition is drawn in the page: the system's own candidate window carries it.

- [x] **Step 8: Commit**

```bash
git add src/ui/markdown/editing/text_commands.ts src/ui/markdown/markdown_editor.ts test/probes/input-method.js docs/architecture.md docs/ai-context.md
git commit -m "feat(editor): a word the input method commits is one edit"
```

---

### Task 3: A word in every block

**Files:**
- Test: `test/probes/input-method-blocks.js` (new), `test/probes/input-method-literals.js` (new)
- Modify: `test/README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–2; no production code is expected to change. If a case fails,
  the fix belongs where the failing rule lives (`insertAt`'s block rules, or the rule the block
  owns), never in the seam.

**The spec, refined here:** the spec named one probe for the blocks; six documents in one probe
would not fit the bridge's five seconds, so it is two — the prose blocks, and the literal ones.

- [x] **Step 1: Write the prose-blocks probe**

```js
/**
 * A committed word in each prose block: the paragraph, the heading and the list item.
 *
 * The seam does not know what a block is — it hands the word to `insertCommitted`, which
 * follows the same rules typing does. This probe holds that promise at the three places
 * where a paragraph is not a plain paragraph.
 *
 * @covers src/ui/markdown/editing/text_commands.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const seam = () => document.querySelector('.markdown-composition-input');
  /** Composes `word` into the seam, the way the system commits one. */
  const compose = async (word) => {
    const area = seam();
    area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    area.value = word;
    area.dispatchEvent(new CompositionEvent('compositionend', { data: word, bubbles: true }));
    await t.sleep(250);
  };
  const atEndOf = async (blockIndex) => {
    await t.click(t.blocks()[blockIndex], 0.99, 0.5);
    await t.sleep(150);
  };

  await t.load('# 見出し\n\ntext\n\n- item\n');
  await atEndOf(1);
  await compose('文');
  check('a word commits into a paragraph', await t.raw(), '# 見出し\n\ntext文\n\n- item\n');

  await atEndOf(0);
  await compose('字');
  check('and into a heading', await t.raw(), '# 見出し字\n\ntext文\n\n- item\n');

  await atEndOf(2);
  await compose('語');
  check('and into a list item', await t.raw(), '# 見出し字\n\ntext文\n\n- item語\n');

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
```

- [x] **Step 2: Run it**

Run: `npm run probe -- test/probes/input-method-blocks.js`
Expected: PASS — three checks. It passes because Task 2 shares the block rules; if a check fails,
the rule it exercises is the bug, and the fix goes there (not in the seam).

- [x] **Step 3: Write the literal-blocks probe**

```js
/**
 * A committed word in the blocks that keep their own rules: a table cell, a fenced
 * code block and an empty display formula.
 *
 * A table cell holds text and not lines; a code block is literal text where a bracket
 * is the author's own character; a display formula's content gets a line of its own
 * (`syntax/math_edits.ts`). A word the system commits lands under those rules too.
 *
 * @covers src/ui/markdown/editing/text_commands.ts, src/ui/markdown/syntax/math_edits.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const seam = () => document.querySelector('.markdown-composition-input');
  const compose = async (word) => {
    const area = seam();
    area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    area.value = word;
    area.dispatchEvent(new CompositionEvent('compositionend', { data: word, bubbles: true }));
    await t.sleep(250);
  };

  await t.load('| a | b |\n| - | - |\n| 1 | 2 |\n');
  await t.click(t.prose().querySelectorAll('[data-table-cell]')[3], 0.99, 0.5);
  await compose('文');
  check('a word commits into a table cell', await t.raw(), '| a | b |\n| - | - |\n| 1 | 2文 |\n');

  await t.load('```\ncode\n```\n');
  await t.click(t.prose().querySelector('pre'), 0.99, 0.5);
  await compose('字');
  check('and into a code block', await t.raw(), '```\ncode字\n```\n');

  await t.load('text\n\n$$\n$$\n\ntail\n');
  await t.click(t.prose().querySelector('[data-display="true"]'), 0.5, 0.5);
  await compose('語');
  check('and into an empty display formula, on its own line',
    await t.raw(),
    'text\n\n$$\n語\n$$\n\ntail\n');

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
```

- [x] **Step 4: Run it**

Run: `npm run probe -- test/probes/input-method-literals.js`
Expected: PASS — three checks. The table cell's caret is placed by clicking the cell's own
placeholder (`[data-table-cell]`), and the formula's by clicking its rendering, which enters the
source with the caret at the content's edge (the shape `math_edits.ts` handles).

- [x] **Step 5: The index, types and checks**

Add both to `test/README.md` beside the other editing probes:

```
`input-method-blocks.js` — a committed word in a paragraph, a heading and a list item;
`input-method-literals.js` — the same in a table cell, a code block and an empty display
formula
```

Run: `npx tsc --noEmit && npm run check`
Expected: silent, then `40/40 checks passed`.

- [x] **Step 6: Commit**

```bash
git add test/probes/input-method-blocks.js test/probes/input-method-literals.js test/README.md
git commit -m "test(editor): a committed word in every block"
```

---

### Task 4: Escape stays the input method's

**Files:**
- Modify: `src/ui/floating/surface.ts` (the Escape listener)
- Test: `test/probes/input-method-escape.js` (new)
- Modify: `test/README.md`

**Interfaces:**
- Consumes: the seam's element (found by its class), `services/messages.ts: notify`.
- Produces: nothing other tasks use.

- [x] **Step 1: Write the failing probe**

```js
/**
 * Escape while an input method is composing cancels the composition, and nothing else.
 *
 * Every floating surface puts itself away on Escape (`floating/surface.ts`), and the
 * key a composition is cancelled with reaches them too. The reader who asked for the
 * composition to go away did not ask for the message they are reading to go with it.
 *
 * @covers src/ui/floating/surface.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const { notify } = await t.app('/src/services/messages.ts');
  const card = () => document.querySelector('[data-message]');
  const seam = () => document.querySelector('.markdown-composition-input');

  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(150);
  notify('probe', new Error('the message the composition must not close'));
  await t.sleep(250);
  check('the message is open', card() !== null, true);

  const area = seam();
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  area.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true })
  );
  await t.sleep(250);
  check('the cancelled composition left the message alone', card() !== null, true);

  // And the surface still answers an Escape of its own.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await t.sleep(250);
  check('a plain Escape still puts it away', card() === null, true);

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
```

- [x] **Step 2: Run it and watch it fail**

Run: `npm run probe -- test/probes/input-method-escape.js`
Expected: FAIL — `the cancelled composition left the message alone` is `false`: the surface's
listener sees the key, because `Escape` reaches the document whatever `isComposing` says.

- [x] **Step 3: Teach the surfaces the difference**

In `src/ui/floating/surface.ts`, in `watchEscape`:

```ts
    document.addEventListener('keydown', (event) => {
      // Escape belongs to the input method while a composition is in flight: it
      // cancels the word the reader is choosing, and a surface is not what they asked
      // to put away (see `editing/composition_input.ts`).
      if (event.isComposing) {
        return;
      }
      if (event.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
```

and its opening comment gains the reason:

```ts
   * Escape puts every surface away. Wired on the first open, once, because the listener lives as
   * long as the window: a surface that has never been shown has nothing to put away. A key that
   * arrives while an input method is composing is not this one's.
```

- [x] **Step 4: Run the probe again**

Run: `npm run probe -- test/probes/input-method-escape.js`
Expected: PASS — three checks.

- [x] **Step 5: The index, types and checks**

Add to `test/README.md` beside the other editing probes:

```
`input-method-escape.js` — a cancelled composition does not close the message the
reader is reading, while a plain Escape still does
```

Run: `npx tsc --noEmit && npm run check`
Expected: silent, then `40/40 checks passed`.

- [x] **Step 6: Commit**

```bash
git add src/ui/floating/surface.ts test/probes/input-method-escape.js test/README.md
git commit -m "fix(editor): a cancelled composition does not close a surface"
```

---

## The whole suite

After Task 4, run the full sweep once: `npx tsc --noEmit`, `npm run check`, and `npm run probe:all`.
The suite's known environmental failures on this machine are the five probes that need a populated
workspace (`completion-wikilink`, `document-stack`, `document-stack-ask`, `document-stack-restore`)
and `edit-cost`/`edit-stability`, whose large-note timing is longer than the bridge's budget — the
same set a clean checkout shows. Everything else must be green, including the four new probes.

No new Node check is expected: the commit's "step of its own" is `history.ts`'s `other` kind, which
`check-history.mjs` already walks, and the seam's rules are about a live element a Node check cannot
have. If a pure rule does appear while implementing (what a commit holds, which keys are the seam's),
it goes to `test/checks/` with a name of its own.

## What only a person can confirm

The system's own candidate window appearing at the caret, and a real Pinyin or Kana word being
chosen and committed, cannot be driven from a probe — a dispatched `CompositionEvent` carries no
text and no IME. It is worth one manual pass: focus the editor, type `nihao` with a Chinese input
source, pick a candidate, and check it lands at the caret as one undo step. If this machine has
such an input source, the same can be tried by driving the system's own keystrokes.

## Corrections while executing

Three things the plan could not see from where it was written, all of them found by the probes:

- **The renderer owns the root it drew, not the scroller's contents.** `render()` replaced
  everything in the scroller, so the seam — a child of it — was wiped on every document opening and
  every layout change. It now removes its own previous root and appends the new one; the scroller
  is the editor's, and holds things of the editor's.
- **A document selection is one inside the prose root.** A focused textarea makes the browser
  report a selection of its own, anchored in the scroller; `editorSelection` read that as the
  reader's place, so the next keystroke after an edit went to document offset 0 (`editing/context.ts:
  isDocumentRange`, which the editor's `selectionchange` bookkeeping uses too).
- **Where the keyboard goes and where the selection goes are one question.** Focusing the prose
  root — what `placeCaret` and `selectAll` did — is a focus change the seam then reverses, and the
  reversal drops a selection that was just made. `EditorContext.focusText` is the one hook, and
  `selectAll` asks for the keyboard *before* it makes the selection.

Two probes were adjusted rather than the code: the list-item case clicks the item's own text (a
click on the block's box lands on the marker's placeholder), and `versioning-diff.js` asked for the
keyboard on the scroller's own box, where it now sits on the seam inside it.

### And one thing no probe could have caught

The seam as specced and built — `opacity: 0`, a hair-thin box — **does not work with a real input
method**: macOS will not compose into a field it cannot see. The reader found it by trying; the
system's own keystrokes then said the same, and the spec's *What composes* section has the
measurements. The fix, in Task 1's files:

- the rule is now `opacity: 1`, a box with a real width and a `min-height` of two lines, transparent
  ink and a transparent background — invisible to the reader, visible to the system, and covering no
  character (so no word gains a gap), with no `caret-color` declared, which WebKit refuses;
- `composition_input.ts` seats the seam at the caret but no longer sizes it to the caret's height,
  because an 18px field gets no composition;
- `input-method.js` grew three checks holding that shape, since a tidy-up back to "invisible" would
  break the system's input again while every probe still passed.

Two more things the work learned, worth the next reader's time: a synthetic click cannot warm an
input context (real pointer input can), and a page reload is what puts a seam style change in reach
of the system's own keystrokes.

### And what the second report found

The reader's next try — a space after every Chinese word, and Chinese that stopped working after the
first one — turned out to be the commit path rather than the seam's shape, and both are fixed in
Task 1 and Task 2's files:

- the candidate-selecting space arrives as ordinary text a moment after `compositionend`, so the
  seam now drops a lone space inside a 50ms window of a commit (a `compositionend` sets the window);
- committing is an edit, an edit restores the caret, and restoring it called `focus()` — a native
  focus call inside the input method's own key handling, after which it gave up on the field.
  `focusText` asks only when the field does not already hold the keyboard;
- and marked text sent as `insertCompositionText` with no composition events is no longer typed into
  the document one character at a time.

`input-method.js` holds the first and third with checks of their own; the second is a guard that no
event can observe, and is written down here and in `focusText`'s comment instead.

Driving the real method again with a key log found the sharper version of the second: the candidate
key reaches the editor as `keyCode` 229 with the composition already over, so **the key path** typed
it — and that edit, raised inside the method's own key handling, is what it never recovered from.
So two more changes, both now in the shipped code:

- `markdown_editor.ts: handleKeydown` leaves a `keyCode` 229 key to the input method, alongside
  `isComposing`;
- `composition_input.ts` hands itself the keyboard again after a commit (`blur()`, then a
  `requestAnimationFrame` `focus()`), because the commit's edit costs the field its input context.

`input-method.js` checks both — a dispatched `keyCode` 229 key must be left alone, and the field must
have the keyboard again once the commit's turn is over — and the proof is a real run: two words in a
row compose, and the document reads `你好你好`.
