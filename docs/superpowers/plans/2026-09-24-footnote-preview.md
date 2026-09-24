# Footnote Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** hovering a footnote marker shows the definition it names, rendered, in a
card that cannot take the caret.

**Architecture:** a small view module (`footnote_preview.ts`) watches the editor's
content view for a pointer on `[data-footnote-ref]`, asks the *document* where that
label's definition body starts (`syntax/footnotes.ts: footnoteOffsets`), and renders
it with the components the notes run already uses — one renderer, not a second one —
inside one card element appended to the page, positioned from the marker's rect and
`pointer-events: none` so it can never steal a click or the caret.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+, daisyUI 5.

**Spec:** this document's part 1, from the user's request in this thread.

## Global Constraints

- **Behaviour is preserved**: the document, the blocks, the rendering, the caret,
  the click routing and the jump are all unchanged. The preview adds an element and
  takes nothing away.
- The offsets do not move; nothing new is recorded in the document or the history.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` stays green,
  with the probe count growing by one.
- Commit style: `feat(…): …`, `test(…): …`, `docs: …`, and a `merge:` commit.

---

## Part 1 — the design

### 1.1 Where the text comes from

Not from the rendered `.markdown-footnote` element: blocks are virtualised, so the
definition's block is mounted only when the notes run is on screen. The document is
the source: `footnoteOffsets(text, label).definitionBody` is where the definition's
own text starts (the one home of that fact), `state.getBlockAtOffset(body)` is the
block it sits in, and that block's parse holds the `footnoteDefinition` node.

### 1.2 What is rendered

The definition's **body**, by the same code the notes run uses: `nodes/footnote.ts`
gains `renderFootnoteBody(node)`, the content span (the definition's inline children
through the registry), and `FootnoteDefinition` uses it too, so an italic note, a
link or a citation looks in the preview exactly as it looks at the bottom of the page.
The `[1]` back-anchor is not part of the body: the card is read-only, and an anchor
in it would jump nothing.

### 1.3 The card and its manners

One element, `class="markdown-footnote-preview card bg-base-200 …"`, appended to the
page with `position: fixed`, sized to a comfortable max width, and positioned from the
marker's rect (below it; clamped into the viewport horizontally). `pointer-events:
none` means it never intercepts a click or a hover.

It appears after a **200 ms dwell** on the marker, and hides on: leaving the marker
(`mouseout` whose `relatedTarget` is outside it), a scroll of the editor, a click, and
`Escape`. Two silences: **nothing for a label with no definition**, because there is
nothing to show; and **nothing while the marker is its own source**, because that is
the author editing the label and a card in the way is noise.

### 1.4 Not this phase

Making the card interactive (a link inside a note that can be clicked, or the card
itself focusable), and the definition's own label, which is still not editable.

---

## Part 2 — tasks

### Task 1: The preview

**Files:**
- Modify: `src/ui/markdown/nodes/footnote.ts` (the body renderer)
- Create: `src/ui/markdown/footnote_preview.ts`
- Modify: `src/ui/markdown/markdown_editor.ts` (install it)

**Interfaces:**

- Produces: `renderFootnoteBody(node: AstFootnoteDefinition): HTMLElement` and
  `installFootnotePreview(context: EditorContext): void`.

- [ ] **Step 1: The body, in one place**

In `nodes/footnote.ts`, lift the content building out of the constructor:

```ts
/** A definition's content, inline: what the notes run shows after the label. */
export function renderFootnoteBody(node: AstFootnoteDefinition): HTMLElement {
  const content = document.createElement('span');
  content.className = 'inline';
  // Flatten paragraph children to inline content so the number and text stay on one line.
  for (const child of node.children) {
    if (child.type === 'paragraph') {
      for (const grandChild of child.children) {
        const component = createComponent(grandChild);
        if (component) {
          content.appendChild(component.element);
        }
      }
    } else {
      const component = createComponent(child);
      if (component) {
        content.appendChild(component.element);
      }
    }
  }
  return content;
}
```

and have `FootnoteDefinition`'s constructor append `renderFootnoteBody(node)`.

- [ ] **Step 2: The preview module**

```ts
/**
 * The card that shows a footnote when the pointer rests on a marker.
 *
 * The text is the document's: `syntax/footnotes.ts` says where a label's definition
 * body starts, the block there is parsed as any block is, and its body is rendered
 * with the components the notes run uses — the preview is a second *place* to see a
 * note, never a second renderer of one.
 *
 * May import: the state and blocks (the document), the footnotes rule, the node
 * registry's block factory, `source_mode.ts` (the frame a node needs), the editing
 * context and the DOM. Upholds: showing a note changes nothing — no edit, no caret,
 * no state — and the card cannot take a click (`pointer-events: none`).
 */
```

with `installFootnotePreview(context)` adding a `mouseover`/`mouseout` pair to
`context.contentView` and to its scroll, plus `click` and `Escape` to hide; the card
is created lazily, appended to `document.body`, and its content built by
`withRenderFrame(block, () => renderFootnoteBody(node))` inside a
`createBlockComponent`-free path: the parse's `footnoteDefinition` node is found and
rendered directly, so nothing of the marker's own block is rebuilt.

```ts
const DWELL_MS = 200;
const CARD_CLASS = 'markdown-footnote-preview';

function bodyNodeFor(context: EditorContext, label: string): {
  node: AstFootnoteDefinition;
  block: MarkdownBlock;
} | null {
  const body = footnoteOffsets(context.state.getText(), label).definitionBody;
  if (body === null) {
    return null;
  }
  const block = context.state.getBlockAtOffset(body);
  if (!block) {
    return null;
  }
  const node = context.state
    .getBlockContent(block)
    .find((child) => child.type === 'footnoteDefinition') as AstFootnoteDefinition | undefined;
  return node ? { node, block } : null;
}
```

- [ ] **Step 3: Install it**

In `markdown_editor.ts`'s constructor, beside the click routing:
`installFootnotePreview(this.context);`

- [ ] **Step 4: Run the app, by hand and by probe**

`npm run tauri dev`, open a note with footnotes, hover a marker: the card appears
after a moment with the note's text, and leaves when the pointer does. Then Task 2's
probe.

- [ ] **Step 5: Commit**

```bash
git add src/ui/markdown/nodes/footnote.ts src/ui/markdown/footnote_preview.ts src/ui/markdown/markdown_editor.ts
git commit -m "feat(footnote): a marker shows its note when the pointer rests on it"
```

### Task 2: The probe

**Files:**
- Create: `test/probes/footnote-preview.js`
- Modify: `test/README.md`

**Interfaces:**

- Produces: the phase's evidence.

- [ ] **Step 1: The probe**

```js
/**
 * The card a footnote marker shows when the pointer rests on it.
 *
 * Three things: it appears with the definition's text after the dwell, it does not
 * appear for a label the document does not define, and it leaves when the pointer
 * does. Its position is checked against the marker's rect, because a card that points
 * at the wrong marker is worse than none.
 *
 * @covers src/ui/markdown/footnote_preview.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const card = () => document.querySelector('.markdown-footnote-preview');
  const hover = async (element) => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent('mouseover', {
        bubbles: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2
      })
    );
    await t.sleep(500);
  };

  await t.load('Body text[^1] here, and a stray[^9].\n\n[^1]: A *note* with a [link](https://example.com).\n');
  const markers = [...t.prose().querySelectorAll('[data-footnote-ref]')];
  check('the document has two markers', markers.length === 2, markers.length);

  await hover(markers[0]);
  const shown = card();
  check('resting on a marker shows its note', shown !== null, Boolean(shown));
  check(
    'and the note is the one it names, rendered',
    shown !== null &&
      shown.textContent.includes('A note with a link.') &&
      shown.querySelector('em, i') !== null &&
      shown.querySelector('a') !== null,
    shown ? shown.textContent : null
  );
  check('the card points at the marker it came from', (() => {
    if (!shown) {
      return false;
    }
    const marker = markers[0].getBoundingClientRect();
    const box = shown.getBoundingClientRect();
    return box.top >= marker.top - 2 && box.top <= marker.bottom + 24 && box.left <= marker.right + 4;
  })(), shown ? t.rectOf(shown) : null);
  check('the card cannot take the pointer', shown !== null && getComputedStyle(shown).pointerEvents === 'none', null);

  t.prose().dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
  await t.sleep(300);
  check('leaving the marker takes the card away', card() === null, Boolean(card()));

  await hover(markers[1]);
  check('a label with no definition shows nothing', card() === null, card() ? card().textContent : null);
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
```

Fill any expectation in from a run rather than guessing, and prefer the exact strings
the app produces.

- [ ] **Step 2: Run it, and the neighbours**

`npm run probe -- test/probes/footnote-preview.js` → `failed: []`, then the footnote
probes one at a time: `footnote-source`, `footnote-jump`, `footnote-jump-back`,
`footnote-button`, `footnote-notes-run`, `footnote-enter`, `footnote-block` — the
preview must not have disturbed any of them.

- [ ] **Step 3: Index it, and commit**

`test/README.md`: seventy-five probes become seventy-six.

```bash
git add test/probes/footnote-preview.js test/README.md
git commit -m "test(footnote): rest on a marker and read its note"
```

### Task 3: Acceptance, docs, handoff, merge

- [ ] **Step 1: The docs**

`docs/architecture.md`: the footnote row of the extension table gains the preview —
where the text comes from, that it is read-only, and the dwell/hide rule.

- [ ] **Step 2: Acceptance**

```bash
npx tsc --noEmit
npm run check                                   # 20/20 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 70/70 probes, 6 skipped
```

- [ ] **Step 3: The handoff, and the commit**

Append to this plan: what changed, where the text comes from and why it is not the
rendered notes run, the card's manners, and what is left (an interactive card).

```bash
git add docs/architecture.md docs/superpowers/plans/2026-09-24-footnote-preview.md
git commit -m "docs: close the footnote preview handoff"
```

- [ ] **Step 4: Merge**

```bash
git checkout main
git merge --no-ff codex/footnote-preview -m "merge: rest on a footnote marker to read its note (footnote preview)"
git rev-parse HEAD^{tree} codex/footnote-preview^{tree}   # must be equal
```

Keep the branch, and report the tree hash.
