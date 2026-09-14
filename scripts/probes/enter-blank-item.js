(async () => {
  const t = window.__t;
  await t.load('- a\n- \n- b\n');
  const item = t.blocks().find((b) => b.textContent.includes('a'));
  await t.click(item.querySelector('.markdown-list-placeholder').closest('li'));
  const caret = t.caretRect();
  t.key('Enter');
  await t.sleep(250);
  return {
    caretBeforeEnter: caret,
    after: await t.raw(),
    emptyLines: t.emptyLines(),
    lists: t.prose().querySelectorAll('ul').length
  };
})()
