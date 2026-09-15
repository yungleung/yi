(async () => {
  const t = window.__t;
  window.__caretLog = [];
  await t.load('- a\n- \n- b\n');
  const item = t.blocks().find((b) => b.textContent.includes('a'));
  await t.click(item.querySelector('.markdown-list-placeholder').closest('li'));
  t.key('Enter');
  await t.sleep(400);
  const afterEnter = {
    raw: await t.raw(),
    caret: t.caretRect(),
    carets: document.querySelectorAll('.markdown-caret').length,
    log: window.__caretLog
  };
  window.__caretLog = undefined;
  t.key('x');
  await t.sleep(250);
  return { afterEnter, afterTyping: await t.raw(), caretAfterTyping: t.caretRect() };
})()
