(async () => {
  const t = window.__t;
  const out = t.report({});
  await t.load('a\n\n\nb\n');
  const emptyLine = () =>
    t.blocks().find((b) => b.querySelector('.markdown-empty-line-placeholder'));
  const geometry = () => t.blocks().map((b) => Math.round(b.getBoundingClientRect().top));

  const before = geometry();
  await t.click(emptyLine().querySelector('.markdown-empty-line-placeholder'));
  out.caretAfterClick = t.caretRect();
  t.key('x');
  await t.sleep(250);
  out.afterTyping = await t.raw();
  out.geometryStable = JSON.stringify(before) === JSON.stringify(geometry());

  t.key('Backspace');
  await t.sleep(200);
  out.afterFirstBackspace = await t.raw();
  out.caretBeforeSecond = t.caretRect();
  t.key('Backspace');
  await t.sleep(250);
  out.afterDeletingTheLine = await t.raw();
  out.emptyLinesLeft = t.emptyLines().length;
  return out;
})()
