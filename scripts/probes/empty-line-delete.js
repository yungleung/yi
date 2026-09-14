(async () => {
  const t = window.__t;
  await t.load('a\n\n\nb\n');
  const emptyLine = () =>
    t.blocks().find((b) => b.querySelector('.markdown-empty-line-placeholder'));
  await t.click(emptyLine().querySelector('.markdown-empty-line-placeholder'));
  const caret = t.caretRect();
  t.key('Backspace');
  await t.sleep(250);
  return {
    caret,
    after: await t.raw(),
    emptyLinesLeft: t.emptyLines().length,
    emptyLineStillRendered: !!emptyLine()
  };
})()
