# Adding a node type

A node type is one mdast construct — a markdown thing the parser recognises and the
renderer has to draw. This recipe is the whole job; follow it in order.

## 1. Teach the parser about it (only if remark does not already)

Most constructs already exist: `remark-gfm` gives tables and task lists,
`remark-math` gives formulas, and this repository adds `remark-citation`,
`remark-wikilink` and `remark-deflist` under `src/ui/markdown/plugins/`. If your
construct is one of those, skip to step 2.

Otherwise add a plugin beside them, register it in `src/ui/markdown/parser.ts` (both
the parse and the stringify processor), and declare the node in
`src/ui/markdown/mdast.d.ts` so it flows into `RootContent`; then add the alias in
`src/ui/markdown/ast.ts`.

## 2. Write the component

Create `src/ui/markdown/nodes/<type>.ts`:

```ts
import { EditableNodeComponent } from './editable_node';
import type { AstYourNode } from '../ast';

/** Renders a `yourNode` as … */
export class YourNode extends EditableNodeComponent {
  constructor(node: AstYourNode) {
    super('yourNode', node, document.createElement('span'), 'markdown-your-node');
    this.element.textContent = node.value ?? '';
  }
}
```

`EditableNodeComponent` gives you the marker contract: the element is rendered and a
click places the caret. The header comment matters — say what the file is for, what
it may import, and the invariant it upholds (`docs/writing-comments.md`).

If your node has text leaves, tag them with the block-relative raw offset they start
at (`element.dataset.textFrom = String(offset)`), which is what lets the caret map
back to the document exactly. `nodes/text.ts` is the smallest example. That tag has
to be exact — the span's text has to be the document's own characters from that
offset — because it is also what lets a plain keystroke be written straight into the
leaf's text node instead of rendering the block (`syntax/plain_edit.ts`,
`editing/typed_text.ts`).

## 3. Register it

In `src/ui/markdown/create_node.ts`:

```ts
registerComponent('yourNode', (node) => new YourNode(node as AstYourNode), true);
```

The third argument, `showsSource`, says your node's markdown source *can stand in
for its rendering* — set it when the rendering hides the characters the author typed
(a link's title, a formula's KaTeX, a citation's formatted reference). That is the
list `source_mode.ts` consults, and it is what makes the caret able to live in the
node.

## 4. If it shows source, decide how a click enters it

Extend `RevealableNodeComponent` instead, and build the source view before
`super()`:

```ts
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';

const SOURCE_CLASS = 'markdown-your-node-source';

export class YourNode extends RevealableNodeComponent {
  constructor(node: AstYourNode) {
    const sourceView = sourceViewFor(node, SOURCE_CLASS, contentRange);
    super('yourNode', node, sourceView ?? document.createElement('span'), sourceView ? '' : 'markdown-your-node');
    if (sourceView) {
      return;                       // the element *is* the source now
    }
    this.element.textContent = node.value ?? '';
  }

  /** The part of the source that is content, without its markers. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return contentRange(source);
  }
}

function contentRange(source: string): { start: number; end: number } {
  return { start: 1, end: Math.max(1, source.length - 1) };
}
```

A click on the rendering then enters the source at the end of that content, and the
next click lands on the character clicked.

If what you show is only *part* of the node — a footnote definition's node covers the
whole note, and only the `[^label]` at its head is the label — then `sourceViewFor`
cannot ask the question for you, because `isShownSource` compares the node's whole range.
Ask `source_mode.ts: isShownSourceRange` with your own block-relative range, name that
range for the caret in `editing/context.ts: sourceRangeIn`, and keep the shape of the
part in one place under `syntax/` (`syntax/footnotes.ts: markerShape` is the worked
example, and `test/probes/footnote-jump-back.js` is its proof).

And if what you draw is a *different length* from the source it stands for — a marker
draws `[1]` for `[^1]` — say what it draws in `caret/offsets.ts: renderedLength`, and carry
an offset inside the drawing to the source it stands for in `offsets.ts: mapNode` and
`caret/dom_position.ts: mapNodeRawToRendered`. A length the caret model does not know
shifts every caret that walks into the drawing by the difference.

A rendering never navigates, whatever element it is made of: the app owns a node's clicks, and
an `<a href>` a rendering happens to be — a footnote marker's `#fn-1` — would otherwise take the
webview to a fragment and scroll the page under the reader's hands. `nodes/editable_node.ts`
prevents it for every node; if your rendering needs its own handler, do that there rather than
in the node.

## 5. Prove it

Write a probe in `test/probes/` that clicks the node, types a character, and asserts
the raw document — the shape `test/probes/revealable-flows.js` uses:

```js
(async () => {
  const t = window.__t;
  const checks = [];
  await t.load('before [[your node]] after\n');
  await t.click(t.prose().querySelector('.markdown-your-node'), 0.5);
  t.key('X');
  await t.sleep(250);
  checks.push({
    name: 'typing lands inside the node',
    actual: await t.raw(),
    expected: 'before [[your nodeX]] after\n',
    pass: (await t.raw()) === 'before [[your nodeX]] after\n'
  });
  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
```

## 6. Say whether a letter could open or close it

Nothing in the renderer has to know about your construct: the fast path that writes
a keystroke into the text node instead of rendering the block is decided by
characters and tags, not by node types. `syntax/plain_edit.ts` accepts a letter, a
digit, a space or a piece of punctuation that means itself, in a place where no
marker, line beginning, line edge, autolink or setext underline could change what the
line means, and `editing/typed_text.ts` then refuses any edit that does not map into
one span whose text is the document's own characters.

What the rule *assumes* is that every construct needs a character it does not accept:
a marker (`*`, `` ` ``, `[`, `|`, `$`, `@`, `/`, …), a line's own beginning (`1. `, `#`,
`: `, `- `), or a space at a line edge — which is why `www.`, the one autolink the
accepted characters can spell, has a guard of its own. If yours is opened by none of
those — if a letter typed into prose could start or end it — the rule is wrong about
it, and that has one home and two proofs:

- `syntax/plain_edit.ts`: the guard that refuses the edit, beside the guard on the
  runs on both sides of it, which already refuses a run that is not letters (that is
  what keeps a link's destination, a bare URL and a footnote's label out of the
  write, and what keeps a space from turning one into a link).
- `test/checks/check-plain-edit.mjs`: a document in its corpus. That list is written
  by hand, so a construct it does not name is a construct the property does not
  cover.
- `test/probes/typed-text.js`: a case that types where the construct is, and says
  which path took the keystroke.

The deferred check behind the fast path (`editing/context.ts: scheduleVerify`) is a
safety net rather than a licence: it renders a block again when the parse it now has
is not the shape it was built from, which heals a stale rendering a moment later —
but only when the shape moved, and a construct that changes a rendering without
adding or removing nodes is not covered by it.

## 7. Run everything

```bash
npx tsc --noEmit
npm run check
npm run tauri dev                                   # terminal 1
npm run probe -- test/probes/<your-probe>.js        # terminal 2
```

If a rendering rule is a pure function of the text, put it in a syntax module and
test it in `test/checks/` instead — that is faster and it cannot rot.

## When it is a block kind, not a node type

A construct the splitter cuts into a block of its own is a different job from a node
type inside one: display maths, fenced and indented code, HTML and frontmatter are
block kinds. They are the `BlockKind` union in `document/blocks.ts`, the splitter
that assigns the kind, and two tables that say what the renderer may do with it:

- `isRawRendered(kind)` — whether the block renders its raw source as it stands,
  without the markdown inside it being parsed into nodes (a `- ` inside a code block
  is code, not an empty list item).
- `hasSourceMode(kind)` — whether the block's own text can stand in for its view,
  the way a display formula shows its `$$…$$` while the caret is inside it. A kind
  that should be editable as its own source and is missing here renders its view
  instead, and the caret has nothing to sit on.

The invariants above apply here too: a block kind whose text stands in for its view
is tagged as the block's own text from offset `0` (`nodes/source_text.ts`), which is
what makes a keystroke inside it exact. And the renderer keys an element by its
content *and* by the shape it was built in — for a block, the shape comes from
`source_mode.ts: shownSourceWithinBlock` (`virtual_block_renderer.ts: renderKey`) —
so a kind that can render two ways has to go through that, or the text and the view
are handed each other's element.
