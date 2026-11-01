/**
 * What rebuilding the block a keystroke lands in costs, against patching the text
 * node that keystroke changed.
 *
 * The pair of numbers is the phase's reason: building a block's DOM is cheap,
 * replacing it in the page is not, and the layout that replacement invalidates is
 * what the next geometry read pays for. The keystrokes that ask for one are the other
 * half of the comparison, and they are `block-keystroke-cost.js`: held together the
 * two outlived the bridge's five seconds on the fixture note (measured: 5 020 ms, cut
 * off between the rounds).
 *
 * The block is the document's last one, which is the fixture note's biggest (measured:
 * 4 785 characters, 41 lines, 189 elements) and the block the sibling probe's caret is
 * in.
 *
 * Runs against the document the runner was given — the 323 KB fixture note under
 * `probe:all`, the demo document by name.
 *
 * @covers src/ui/markdown/create_block.ts, src/ui/markdown/document/state.ts
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
  const { splitBlocks } = await t.app('/src/ui/markdown/document/block/model.ts');
  const { createBlockComponent } = await t.app('/src/ui/markdown/create_block.ts');
  const out = t.report({});
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const round = (value) => Math.round(value * 100) / 100;

  // Scrolling has to converge before anything is measured: blocks are measured as they
  // are mounted, so one jump to `scrollHeight` lands where the estimates said the end
  // was, not where it is. The loop stops once the scroller is at its bottom and reports
  // how many steps that took — the four the old fixed loop spent waiting after it had
  // converged were 1 200 ms of a five-second budget (measured: it is there after two).
  const scroller = t.scroller();
  let scrollSteps = 0;
  for (; scrollSteps < 8; scrollSteps += 1) {
    scroller.scrollTop = scroller.scrollHeight;
    await t.sleep(300);
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
      break;
    }
  }
  out.atBottom = {
    steps: scrollSteps,
    scrollTop: Math.round(scroller.scrollTop),
    scrollHeight: Math.round(scroller.scrollHeight),
    clientHeight: Math.round(scroller.clientHeight)
  };
  const lineStart = Number(t.blocks()[t.blocks().length - 1]?.dataset.lineStart);

  // The document after the page has been driven: reading the whole text is the bridge's
  // slow path, so it comes once the block is in hand.
  const text = await t.raw();
  const blocks = splitBlocks(text);
  const block =
    blocks.find((candidate) => candidate.lineStart === lineStart) ?? blocks[blocks.length - 1];
  const state = new MarkdownEditorState(text);
  const children = state.getBlockContent(block);
  // The live element the keystrokes land in — the sibling probe measures them, and the
  // block is the same one: its line start is what finds it in either probe.
  const element = t.blocks()[t.blocks().length - 1];
  out.block = {
    kind: block.kind,
    characters: block.text.length,
    lines: block.text.split('\n').length,
    elements: element ? element.querySelectorAll('*').length : 0
  };
  out.document = { characters: text.length, blocks: blocks.length };

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
  out.medianMs = {
    blockParse: round(median(parse)),
    buildDetachedDom: round(median(build))
  };
  // Reported before the two that replace an element on the page, so a bridge that gives
  // up on this note still has the parse and the detached build.
  t.report(out);

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
    ...out.medianMs,
    rebuildBlockAndForceLayout: round(median(rebuild)),
    patchTextNodeAndForceLayout: round(median(patch))
  };
  return out;
})()
