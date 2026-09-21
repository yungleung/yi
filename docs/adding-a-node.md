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
it may import, and the invariant it upholds.

If your node has text leaves, tag them with the block-relative raw offset they start
at (`element.dataset.textFrom = String(offset)`), which is what lets the caret map
back to the document exactly. `nodes/text.ts` is the smallest example.

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

## 6. Run everything

```bash
npx tsc --noEmit
npm run check
npm run tauri dev                                   # terminal 1
npm run probe -- test/probes/<your-probe>.js        # terminal 2
```

If a rendering rule is a pure function of the text, put it in a syntax module and
test it in `test/checks/` instead — that is faster and it cannot rot.
