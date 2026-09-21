(async () => {
  const t = window.__t;
  await t.load('first line\n\nsecond line\n');
  const block = t.blocks().find((b) => b.textContent.includes('first line'));
  const node = t.textNodesIn(block)[0];
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
  await t.sleep(120);
  const before = { raw: await t.raw(), caret: t.caretRect(), lineBottom: Math.round(rect.bottom) };
  t.key('Enter');
  await t.sleep(200);
  const after = await t.raw();
  t.key('x');
  await t.sleep(200);
  return {
    before,
    afterEnter: after,
    caretAfterEnter: t.caretRect(),
    afterTyping: await t.raw(),
    emptyLines: t.emptyLines()
  };
})()
