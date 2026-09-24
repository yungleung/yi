/**
 * What one typed letter costs, by the kind of block the caret is in.
 *
 * The fast path (a write into the text node, no rendering) is the whole reason a plain
 * keystroke costs milliseconds instead of tens of them, and everything written about it so
 * far measures one place: a paragraph. But the path needs two halves to agree — the rule
 * (`syntax/plain_edit.ts`) and the write (`editing/typed_text.ts`, which needs the caret's
 * own characters in one text node inside a tagged span) — and the block kinds differ in
 * the second half: a heading and a list item render their text as text, a fenced code
 * block renders it through highlight.js, and a display formula renders it as a source
 * view.
 *
 * So this probe types one letter at the same place in each kind and reports what it cost,
 * whether the block survived (the fast path) or was built again (the ordinary one), and
 * how many geometry reads the keystroke made. It is the measurement the roadmap's
 * "measure before deciding" column asks for, and the answer decides whether the write half
 * is worth widening.
 *
 * Like the other cost probes it wins its numbers by doing many small things slowly — eight
 * documents, one load each — so its own script outlives the bridge's 5 s budget and the
 * harness recovers the report from its stash. That is this probe's normal way to report.
 *
 * @covers src/ui/markdown/editing/typed_text.ts, src/ui/markdown/create_block.ts
 */
(async () => {
  const t = window.__t;
  const cases = [
    { kind: 'paragraph', document: 'A paragraph with some fairly plain words in it.\n', needle: 'plain' },
    { kind: 'heading', document: '## A heading with some fairly plain words\n', needle: 'plain' },
    { kind: 'list item', document: '- An item with some fairly plain words in it\n', needle: 'plain' },
    {
      kind: 'table cell',
      document: '| Head | Other |\n| --- | --- |\n| some fairly plain words | b |\n',
      needle: 'plain'
    },
    // The two boundaries a phase handoff named as residues, measured rather than assumed:
    // the start of a *list item's* text is past its marker, so it takes the fast path, while
    // the start of a *table cell's* text does not — the cell's middle (its case above) and
    // its end do.
    {
      kind: 'list item, text start',
      document: '- An item with some fairly plain words in it\n',
      needle: 'An item',
      inside: 0
    },
    {
      kind: 'table cell, text start',
      document: '| Head | Other |\n| --- | --- |\n| some fairly plain words | b |\n',
      needle: 'some',
      inside: 0
    },
    {
      kind: 'fenced code',
      document: '```js\nconst plain = someFairlyLongFunction(argument);\n```\n',
      needle: 'plain'
    },
    { kind: 'display math', document: '$$\nplain + fairly = words\n$$\n', needle: 'plain' },
    {
      // The shape the other probes measure on: a block of the fixture note's size. A
      // rebuild is a rebuild of *this*, and a keystroke in it is the ordinary path.
      kind: 'big fenced code',
      document: `\`\`\`js\n${Array.from(
        { length: 80 },
        (_, index) =>
          `const fairlyPlain${index} = someFairlyLongFunction(argument${index}, anotherArgument);`
      ).join('\n')}\n\`\`\`\n`,
      // A word on the *first* line: a block 80 lines deep has most of itself below the
      // window, and a click on a rect outside it lands nowhere (the caret then falls back
      // to the block's start, where the rule refuses — which measures the ordinary path for
      // the wrong reason).
      needle: 'fairlyPlain0'
    }
  ];
  const results = [];
  const { MarkdownEditorState } = await t.app('/src/ui/markdown/document/state.ts');
  const { createBlockComponent } = await t.app('/src/ui/markdown/create_block.ts');
  for (const entry of cases) {
    await t.load(entry.document);
    const block = t.blocks()[0];
    const node = block
      ? t.textNodesIn(block).find((leaf) => leaf.data.includes(entry.needle))
      : null;
    if (!node) {
      results.push({ kind: entry.kind, error: 'the word is not in one text node' });
      continue;
    }
    const caret = document.createRange();
    caret.setStart(node, node.data.indexOf(entry.needle) + (entry.inside ?? 2));
    caret.collapse(true);
    const box = caret.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left,
        clientY: box.top + box.height / 2
      })
    );
    await t.sleep(100);
    const before = { block, node, height: block.getBoundingClientRect().height };
    const reads = { rects: 0, heights: 0 };
    const rects = Element.prototype.getBoundingClientRect;
    const heights = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Element.prototype.getBoundingClientRect = function () {
      reads.rects += 1;
      return rects.call(this);
    };
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        reads.heights += 1;
        return heights.get.call(this);
      }
    });
    const started = performance.now();
    t.key('x');
    const ms = performance.now() - started;
    Element.prototype.getBoundingClientRect = rects;
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', heights);
    await t.sleep(120);
    // The block is found by its line again, not by its text: the letter this probe typed
    // is inside the word it looked for, so the word is not there to search for any more.
    const lineStart = Number(before.block.dataset.lineStart);
    const after = t.blocks().find((element) => Number(element.dataset.lineStart) === lineStart);
    // The floor for a write that re-renders the block's own markup in place instead of
    // replacing the block: the detached build alone — for a code block, that is
    // highlight.js and the DOM under it, with no swap and no page layout.
    const built = [];
    for (let round = 0; round < 2; round += 1) {
      const state = new MarkdownEditorState(entry.document);
      const block = state.getBlocks()[0];
      const started_ = performance.now();
      if (block) {
        createBlockComponent(block, state.getBlockContent(block));
      }
      built.push(Math.round((performance.now() - started_) * 10) / 10);
    }
    results.push({
      kind: entry.kind,
      ms: Math.round(ms * 10) / 10,
      detachedBuildMs: built,
      path: after === before.block ? 'fast' : 'ordinary',
      textNodeSurvived: after ? t.textNodesIn(after).includes(before.node) : false,
      heightChange: after ? Math.round(after.getBoundingClientRect().height - before.height) : null,
      reads
    });
  }
  return { results };
})()
