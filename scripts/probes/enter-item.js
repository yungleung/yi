(async () => {
  const t = window.__t;
  await t.load('- a\n- b\n');
  const first = t.blocks().find((b) => b.textContent.includes('a'));
  const node = t.textNodesIn(first).find((n) => n.data === 'a');
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
  await t.sleep(150);
  const before = await t.raw();
  t.key('Enter');
  await t.sleep(250);
  const afterEnter = { raw: await t.raw(), caret: t.caretRect() };
  t.key('x');
  await t.sleep(250);
  return { before, afterEnter, afterTyping: await t.raw() };
})()
