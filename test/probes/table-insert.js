(async () => {
  const t = window.__t;
  const emit = (event, payload) =>
    window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event, payload });
  const doc = ['First paragraph.', '', '', 'Second paragraph.', ''].join('\n');

  await t.load(doc);
  const blocks = t.blocks();
  // The second block is the empty paragraph between the two paragraphs.
  await t.click(blocks[1]);
  await emit('table_insert', { rows: 3, columns: 2 });
  await t.sleep(400);
  const emptyLine = await t.raw();
  const caretInEmptyLine = t.caretRect();
  t.report({ emptyLine, caretInEmptyLine, blockCount: blocks.length });

  await t.load(doc);
  // `click` measures an element's box, so aim through the text node's parent.
  await t.click(t.textNodesIn(t.blocks()[0]).pop().parentElement, 0.99);
  await emit('table_insert', { rows: 2, columns: 3 });
  await t.sleep(400);
  return {
    emptyLine,
    caretInEmptyLine,
    midParagraph: await t.raw(),
    caret: t.caretRect(),
    firstBlockTop: t.rectOf(t.blocks()[0]).top,
    blocks: t.blocks().map((block) => ({
      lineStart: Number(block.dataset.lineStart),
      text: block.textContent.slice(0, 24)
    }))
  };
})()
