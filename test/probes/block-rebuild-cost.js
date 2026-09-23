/**
 * What rebuilding the block a keystroke lands in costs, against patching the text
 * node that keystroke changed.
 *
 * The pair of numbers is the next phase's reason: building a block's DOM is cheap,
 * replacing it in the page is not, and the layout that replacement invalidates is
 * what the next geometry read pays for. Runs against the document the runner was
 * given — the 323 KB fixture note under `probe:all`, the demo document by name —
 * and the app's own keystroke is measured with the geometry reads it makes counted,
 * which is what says which of the two the editor is paying for today.
 *
 * @covers src/ui/markdown/virtual_block_renderer.ts, src/ui/markdown/create_block.ts
 * @needs-large-document — run against the 323 KB fixture note.
 *
 * Run with:
 *   npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" \
 *     test/probes/block-rebuild-cost.js
 *   npm run probe -- --fixture default-document.md test/probes/block-rebuild-cost.js
 */
(async () => {
  const t = window.__t;
  const { MarkdownEditorState } = await t.app('/src/ui/markdown/document/state.ts');
  const { splitBlocks } = await t.app('/src/ui/markdown/document/blocks.ts');
  const { createBlockComponent } = await t.app('/src/ui/markdown/create_block.ts');
  const out = t.report({});
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const round = (value) => Math.round(value * 100) / 100;

  // The app's own keystroke first, and the document after it: reading the whole
  // text is the bridge's slow path, so it comes once the page has been driven.
  // Scrolling has to converge before anything is clicked: blocks are measured as
  // they are mounted, so one jump to `scrollHeight` lands where the estimates said
  // the end was, not where it is.
  const scroller = t.scroller();
  for (let step = 0; step < 6; step += 1) {
    scroller.scrollTop = scroller.scrollHeight;
    await t.sleep(300);
  }
  // The caret goes after the last character of the last block, which is where the
  // keystrokes below land — and the block the rest of the probe parses, builds and
  // patches is the one those keystrokes went into, found by its first line.
  const last = t.blocks()[t.blocks().length - 1];
  const lineStart = Number(last?.dataset.lineStart);
  const caretNode = last ? t.textNodesIn(last).pop() : null;
  if (!caretNode) {
    return { error: 'no block to put the caret in' };
  }
  const caret = document.createRange();
  caret.setStart(caretNode, caretNode.data.length);
  caret.collapse(true);
  const caretBox = caret.getBoundingClientRect();
  caretNode.parentElement.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      clientX: caretBox.left,
      clientY: caretBox.top + caretBox.height / 2
    })
  );
  await t.sleep(200);
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
  const block =
    blocks.find((candidate) => candidate.lineStart === lineStart) ?? blocks[blocks.length - 1];
  const state = new MarkdownEditorState(text);
  const children = state.getBlockContent(block);
  // The live element the keystrokes landed in — the block itself was replaced
  // under them, which is the behaviour this probe is about.
  const element = t.blocks()[t.blocks().length - 1];
  out.block = {
    kind: block.kind,
    characters: block.text.length,
    lines: block.text.split('\n').length,
    elements: element ? element.querySelectorAll('*').length : 0
  };

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
  out.perKeystrokeReads = {
    rects: round(reads.rect / 11),
    offsetHeight: round(reads.height / 11)
  };
  return out;
})()
