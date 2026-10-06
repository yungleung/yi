/**
 * A keystroke inside a paragraph keeps the elements of the nodes it did not
 * touch: the citations, links and emphasis around the caret are not re-created,
 * and the block's element itself survives.
 *
 * This is the half of "an edit does not cost what the document costs" that
 * element identity can prove without a stopwatch — rebuilding the block instead
 * of patching it invalidates the layout of everything in and below it
 * (`block-rebuild-cost.js` is the measurement of that).
 *
 * @covers src/ui/markdown/render_patch.ts, src/ui/markdown/virtual_block_renderer.ts
 */
(async () => {
  const t = window.__t;
  const out = t.report({});
  const paragraph = t
    .blocks()
    .find((element) => element.textContent.includes('This paragraph has'));
  if (!paragraph) {
    // Run by name without the demo document, this says so rather than throwing
    // inside its own `find` (the mistake `edit-stability.js` made once).
    return {
      checks: [{ name: 'the demo document is loaded', actual: false, expected: true }],
      failed: ['the demo document is loaded']
    };
  }

  const node = t.textNodesIn(paragraph).find((candidate) => candidate.data.includes('strikethrough'));
  const range = document.createRange();
  range.setStart(node, node.data.length);
  range.collapse(true);
  const rect = range.getBoundingClientRect();
  node.parentElement.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      clientX: rect.left,
      clientY: rect.top + rect.height / 2
    })
  );
  await t.sleep(200);

  const before = t.textNodesIn(paragraph).map((text) => text.parentElement);
  const heightBefore = Math.round(t.scroller().scrollHeight);
  t.key('x');
  await t.sleep(300);

  const after = t.blocks().find((element) => element.textContent.includes('This paragraph has'));
  out.paragraph = {
    blockSurvived: after === paragraph,
    nodesBefore: before.length,
    nodesSurviving: after
      ? t.textNodesIn(after).filter((text) => before.includes(text.parentElement)).length
      : 0,
    typed: after ? after.textContent.includes('strikethroughx') : false,
    heightGrowth: Math.round(t.scroller().scrollHeight) - heightBefore
  };
  return out;
})()
