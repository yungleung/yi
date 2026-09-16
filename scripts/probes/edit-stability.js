/**
 * What a line-shifting edit costs, and whether the reader's view moves.
 *
 * Enter at the end of the first paragraph renumbers every block below it. With
 * caches keyed by a block's line number that threw away every rendering below
 * the edit (measured: 1 of 28 elements survived); keyed by content, the blocks
 * keep their DOM. The viewport anchor reports whether the page moved.
 */
(async () => {
  const t = window.__t;
  const before = {
    nodes: new Set(t.blocks()),
    texts: t.blocks().map((b) => b.textContent.slice(0, 18)),
    count: t.blocks().length,
    scrollTop: Math.round(t.scroller().scrollTop)
  };

  const paragraph = t.blocks().find((b) => b.textContent.includes('This paragraph'));
  const node = t.textNodesIn(paragraph).find((n) => n.data.includes('strikethrough'));
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
  await t.sleep(250);

  t.key('Enter');
  await t.sleep(400);

  const afterNodes = t.blocks();
  const survivors = afterNodes.filter((element) => before.nodes.has(element)).length;
  const keptText = afterNodes.filter((element) =>
    before.texts.includes(element.textContent.slice(0, 18))
  ).length;
  return {
    beforeCount: before.count,
    afterCount: afterNodes.length,
    elementsSurviving: survivors,
    blocksWithTextKept: keptText,
    scrollTopBefore: before.scrollTop,
    scrollTopAfter: Math.round(t.scroller().scrollTop)
  };
})()
