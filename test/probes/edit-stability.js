/**
 * What a line-shifting edit costs, and whether the reader's view moves.
 *
 * Enter at the end of the first paragraph renumbers every block below it. With
 * caches keyed by a block's line number that threw away every rendering below
 * the edit (measured: 1 of 28 elements survived); keyed by content, the blocks
 * keep their DOM. The viewport anchor reports whether the page moved.
 *
 * The page is taken to the top of the document before anything is clicked, rather than
 * assumed there: the window the renderer mounts is not the document (`docs/testing.md`),
 * and this probe needs the paragraph its Enter renumbers every block below. A probe that
 * looked for that paragraph in the mounted window read a document that was there all along
 * as "the demo document is loaded: false" — most memorably while the suite ran it just
 * after a probe that had outlived the bridge's budget and was *still typing into the page*
 * (`docs/roadmap.md`).
 */
(async () => {
  const t = window.__t;
  // The document is put at its top rather than assumed there, which is where the paragraph
  // this probe needs is. It is *not* read with `raw()` first: that leaves the document
  // selected, and the selection is still live when the click below lands — measured, the
  // Enter then kept 24 of 28 elements against 27 with no selection, which is this probe's
  // own subject. What says the document is there is the paragraph, once the page has been
  // taken to the top.
  t.scroller().scrollTop = 0;
  await t.sleep(200);
  const before = {
    nodes: new Set(t.blocks()),
    texts: t.blocks().map((b) => b.textContent.slice(0, 18)),
    count: t.blocks().length,
    scrollTop: Math.round(t.scroller().scrollTop)
  };

  const paragraph = t.blocks().find((b) => b.textContent.includes('This paragraph'));
  if (!paragraph) {
    // Run by name without the demo document, this probe used to crash inside its
    // own `find` (a tree walker on `undefined`), which reads like an editor bug. What
    // is reported now is what the page shows instead: the first blocks the renderer
    // mounted, at the top of the document.
    return {
      checks: [
        {
          name: 'the demo document is on screen, at its first paragraph',
          actual: {
            mounted: t.blocks().map((block) => block.textContent.slice(0, 24)).slice(0, 3),
            scrollTop: Math.round(t.scroller().scrollTop)
          },
          expected: 'a mounted block with `This paragraph` in it, at the top'
        }
      ],
      failed: ['the demo document is on screen, at its first paragraph']
    };
  }
  const node = t.textNodesIn(paragraph).find((n) => n.data.includes('strikethrough'));
  const range = document.createRange();
  range.setStart(node, node.data.length);
  range.collapse(true);
  const rect = range.getBoundingClientRect();
  // The click is sent whole — the press, the release, then the click — because
  // `t.raw()` above leaves the document selected and the editor refuses a caret to a
  // gesture that travelled with a selection live (`editing/pointer.ts: endedADrag`):
  // a bare `click` is judged against whatever press the page last saw, which may be
  // another probe's (`test/README.md`, "a click is a gesture").
  const at = {
    bubbles: true,
    cancelable: true,
    clientX: rect.left,
    clientY: rect.top + rect.height / 2
  };
  node.parentElement.dispatchEvent(new PointerEvent('pointerdown', at));
  node.parentElement.dispatchEvent(new PointerEvent('pointerup', at));
  node.parentElement.dispatchEvent(new MouseEvent('click', at));
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
