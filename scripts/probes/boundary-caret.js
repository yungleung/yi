(async () => {
  const t = window.__t;
  await t.load('See [title](https://example.com) now\n');
  const block = t.blocks()[0];
  const last = t.textNodesIn(block).find((n) => n.data.includes('now'));
  const range = document.createRange();
  range.setStart(last, last.data.length);
  range.collapse(true);
  const rect = range.getBoundingClientRect();
  last.parentElement.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      clientX: rect.left,
      clientY: rect.top + rect.height / 2
    })
  );
  await t.sleep(150);
  // Walk left over "now" to land on the link's right boundary, then type: the
  // character must land after the link's source, not inside it.
  for (let step = 0; step < 4; step += 1) {
    t.key('ArrowLeft');
    await t.sleep(80);
  }
  await t.sleep(200);
  const caret = t.caretRect();
  const revealed = !!t.prose().querySelector('.markdown-link-source');
  const blockText = t.prose().textContent;
  t.key('X');
  await t.sleep(250);
  return { caret, revealed, blockText, afterTyping: await t.raw() };
})()
