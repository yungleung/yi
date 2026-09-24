# A Footnote Marker You Can Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a footnote marker can be clicked into and its label edited, with the jump to
its definition kept on Ctrl-click.

**Architecture:** the marker becomes a *revealable* node, the shape a link already
has: while the caret is inside it the node is built as its own source (`[^label]`)
instead of the superscript, and its click enters that source at the label's end. The
one place that decided a marker click is a jump —
`click_routing.ts: routeFootnoteClick` — decides the other way round now: a plain
click is the node's, a Ctrl-click (and a ⌘-click) jumps, and on macOS, where the
system delivers a Ctrl-click as a `contextmenu` rather than a click, that event jumps
too.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** this document's part 1; `docs/roadmap.md`'s footnote item.

## Global Constraints

- **The rendering of a marker at rest does not change**: still a `<sup>` with
  `data-footnote-ref` holding the anchor, so every footnote probe's markup is the
  same.
- **The jump is not lost**: Ctrl-click (and ⌘-click) on a marker, and a plain click
  on a definition's label, both jump as before.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` stays green,
  with the probe count growing by one.
- Commit style: `feat(…): …`, `test(…): …`, `docs: …`, and a `merge:` commit.

---

## Part 1 — the design

### 1.1 Why the marker was not editable

`nodes/footnote.ts` builds a marker as a `<sup data-footnote-ref>` with an `<a>`
inside; `click_routing.ts: routeFootnoteClick` intercepts every click on it in the
capture phase and jumps; and the node is registered without `showsSource`. The
label's characters are therefore hidden behind a rendering (`[1]` is not `[^1]`) with
nothing tagged to map a caret through, so the offset model skips them and neither a
click nor an arrow can reach the label.

### 1.2 The shape

The answer is the one a link already has, rather than a second one invented for
footnotes:

- `FootnoteReference` extends `RevealableNodeComponent`, with
  `sourceViewFor(node, 'markdown-footnote-source', labelRange)` and
  `showsSource: true` in `create_node.ts`. The view branch keeps today's markup
  exactly.
- A plain click reaches the node's own handler, which enters the source at the end of
  the label (`RevealableNodeComponent.entryOffset`), so the caret lands in `[^label]`
  and the arrows can step in and out of it (`caret/navigation.ts` already takes the
  content boundary of a revealed source).
- `markdown-footnote-source` joins `caret/offsets.ts: SOURCE_SELECTOR` and
  `format_dom.ts`'s copy of that list, which is what maps a caret inside the revealed
  label back to the document exactly.
- `routeFootnoteClick` jumps only for a Ctrl-click (or ⌘-click) on a marker; a
  definition's label keeps a plain-click jump, because its own label is not editable
  yet. The marker carries a `title` saying which is which.
- `routeContextMenu` jumps for a Ctrl-click on a marker, because macOS delivers one
  as a `contextmenu` event rather than a `click` — the same gesture, the same result,
  on the platform where the system does the translating.

### 1.3 Not this phase

The definition's own label (`[^label]:`). It has the same gap, but the whole
definition line is that node's source, so making it editable is a different change.

---

## Part 2 — tasks

### Task 1: The marker is revealable, and the click decides

**Files:**
- Modify: `src/ui/markdown/nodes/footnote.ts`
- Modify: `src/ui/markdown/create_node.ts`
- Modify: `src/ui/markdown/click_routing.ts`
- Modify: `src/ui/markdown/caret/offsets.ts`
- Modify: `src/ui/markdown/format_dom.ts`
- Modify: `test/probes/footnote-jump.js`
- Create: `test/probes/footnote-source.js`

**Interfaces:**

- Produces: `.markdown-footnote-source` as a source view class, and the click rule
  above.

- [ ] **Step 1: The marker as a revealable node**

```ts
/** The label between the `[^` and the `]`. */
function labelRange(source: string): { start: number; end: number } {
  const open = source.startsWith('[^') ? 2 : 1;
  return { start: open, end: Math.max(open, source.lastIndexOf(']')) };
}

export class FootnoteReference extends RevealableNodeComponent {
  constructor(node: AstFootnoteReference) {
    const id = String(node.identifier ?? node.label ?? 'note');
    const sourceView = sourceViewFor(node, SOURCE_CLASS, labelRange);
    const view = document.createElement('a');
    view.className = 'text-primary font-medium';
    view.href = `#fn-${id}`;
    view.textContent = `[${id}]`;
    view.id = `fnref-${id}`;
    super('footnoteReference', node, sourceView ?? document.createElement('sup'));
    this.element.dataset.footnoteRef = id;
    this.element.title = 'Click to edit the label, Ctrl-click to jump to the note';
    if (sourceView) {
      return;
    }
    this.element.appendChild(view);
  }

  protected sourceContentRange(source: string): { start: number; end: number } {
    return labelRange(source);
  }
}
```

with `SOURCE_CLASS = 'markdown-footnote-source'`. The view keeps the `<sup>` +
`data-footnote-ref` + anchor markup the probes assert, so a marker renders exactly as
it does today; the source view keeps the same `data-footnote-ref`, so the jump has a
target while the label is shown.

- [ ] **Step 2: Register it as a source-shower**

`create_node.ts`: `registerComponent('footnoteReference', (node) => new FootnoteReference(node as AstFootnoteReference), true)`.

- [ ] **Step 3: The clicks**

```ts
/** Jumps between a footnote's marker and its definition. */
export function routeFootnoteClick(context: EditorContext, event: MouseEvent): void {
  const target = event.target as Element | null;
  const reference = target?.closest<HTMLElement>('[data-footnote-ref]');
  const definition = target?.closest<HTMLElement>('[data-footnote-def]');
  // A marker's own click is the editor's: it opens the label's source so the label
  // can be typed in. Ctrl-click — and ⌘-click — is what jumps.
  const jumping = reference !== null && definition === null && (event.ctrlKey || event.metaKey);
  const element = jumping ? reference : definition;
  const label = element?.dataset.footnoteRef ?? element?.dataset.footnoteDef;
  if (!element || !label) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  jumpToFootnote(context, label, element.dataset.footnoteRef ? 'reference' : 'definition');
}
```

and in `routeContextMenu`, before its table branch: a `contextmenu` whose target is
inside `[data-footnote-ref]` and whose `ctrlKey` is set is the macOS form of that same
Ctrl-click, so it jumps (`preventDefault`, then `jumpToFootnote(…, 'reference')`)
rather than opening a menu.

- [ ] **Step 4: The selector**

`caret/offsets.ts`: `.markdown-footnote-source` joins `SOURCE_SELECTOR`;
`format_dom.ts`'s class list gains it too (it lists the same source classes).

- [ ] **Step 5: The probes**

`footnote-jump.js`: the click that jumps becomes a Ctrl-click
(`ctrlKey: true`), and it also asserts a **plain** click on the same marker does not
jump.

`footnote-source.js` (new):

```js
/**
 * Clicking a footnote marker puts the caret in its label, and the label can be
 * typed in. Ctrl-click is what jumps to the note.
 *
 * @covers src/ui/markdown/nodes/footnote.ts, src/ui/markdown/click_routing.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  await t.load('Body text[^1] here.\n\n[^1]: first note\n\n[^2]: second note\n');
  const marker = t.prose().querySelector('[data-footnote-ref]');
  const box = marker.getBoundingClientRect();
  marker.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2
    })
  );
  await t.sleep(350);
  const shown = t.prose().querySelector('.markdown-footnote-source');
  check(
    'a click opens the marker as its source',
    shown !== null && shown.textContent === '[^1]',
    shown ? shown.textContent : null
  );
  // The caret is at the end of the label: two edits turn [^1] into [^2].
  t.key('Backspace');
  await t.sleep(250);
  t.key('2');
  await t.sleep(300);
  const after = await t.raw();
  check(
    'the label is editable',
    after === 'Body text[^2] here.\n\n[^1]: first note\n\n[^2]: second note\n',
    after
  );
  const renamed = t.prose().querySelector('[data-footnote-ref]');
  check(
    'and the marker is the label it now has',
    renamed !== null && renamed.dataset.footnoteRef === '2',
    renamed ? renamed.dataset.footnoteRef : null
  );
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
```

Run both, then the other footnote probes by name: `footnote-button`,
`footnote-notes-run`, `footnote-enter`, `footnote-jump-back`, `footnote-block`.
Expected: `failed: []` or the report each prints, unchanged apart from the jump.

- [ ] **Step 6: Commit**

```bash
git add src/ui/markdown/nodes/footnote.ts src/ui/markdown/create_node.ts src/ui/markdown/click_routing.ts src/ui/markdown/caret/offsets.ts src/ui/markdown/format_dom.ts test/probes/footnote-source.js test/probes/footnote-jump.js test/README.md
git commit -m "feat(footnotes): a marker click edits its label, Ctrl-click jumps"
```

### Task 2: Acceptance, docs, handoff

- [ ] **Step 1: Acceptance**

```bash
npx tsc --noEmit
npm run check                                   # 20/20 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 69/69 probes, 6 skipped
```

- [ ] **Step 2: The docs, the handoff, the merge**

`docs/architecture.md`: the source-mode row of the extension table gains the footnote
marker, and a sentence says a marker's click edits its label while Ctrl-click jumps
(a definition's label still jumps, since its own label is not editable yet).
`docs/roadmap.md`: the footnote item moves to Closed, and `test/README.md` counts the
new probe. Append this plan's handoff, then:

```bash
git checkout main
git merge --no-ff codex/footnote-source -m "merge: a footnote marker you can click into (footnote source)"
git rev-parse HEAD^{tree} codex/footnote-source^{tree}   # must be equal
```

Keep the branch, and report the tree hash.

---

## Handoff, 2026-09-24 — a marker you can click into

Built in a parallel session on this branch and taken over and finished here, which is
why two small things changed in the takeover: the marker's `title` says **⌘-click**
(the routing accepts `ctrlKey` or `metaKey`, and the tooltip should name the gesture
this machine has), and `footnote-jump-back.js` had to stop measuring the marker's
`<sup>` — a definition's label jumps back to the marker, the jump puts the caret *in*
it, and a marker holding the caret is built as its source, so the element to measure
is `[data-footnote-ref]`.

**What changed.** `FootnoteReference` is a `RevealableNodeComponent` registered with
`showsSource: true`: while the caret is inside it the node is built as `[^label]`
instead of as its superscript — the shape a link already has — and its class joins
`SOURCE_SELECTOR` (and `format_dom.ts`'s copy) so a caret inside the revealed label
maps exactly and the arrows can step in at the content boundary. `click_routing.ts`
gives a marker's plain click back to the editor (the node enters its source) and jumps
on ⌘-click; a definition's label has nothing of its own to edit, so it still jumps on
a plain click. `routeFootnoteMenu` catches the one gesture macOS delivers as a
`contextmenu` rather than a click — Ctrl-click — so the jump is reachable there too.

**The probes.** `footnote-source.js` clicks a marker, sees `[^1]`, types over the
label and checks the document and the re-rendered marker. `footnote-jump.js` shows a
plain click does *not* jump and a Ctrl-click does. `footnote-jump-back.js` walks the
other way, from a definition's label to the marker — and now asserts the marker is
showing its source, which is what a caret in a marker means.

**Acceptance.** `npx tsc --noEmit` clean, `npm run check` 20/20, a freshly started
app and `npm run probe:all` **69/69 (6 skipped)**.

**What is left.** The definition's own label (`[^label]:`) still cannot be edited: the
whole definition line is that node's source, which is a different and larger shape
than a marker's.
