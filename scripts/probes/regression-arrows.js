(async () => {
  const t = window.__t;
  await t.load('a\n\n\nb\n');
  const first = t.blocks().find((b) => b.textContent.trim() === 'a');
  await t.click(first.querySelector('span') ?? first);
  t.key('ArrowDown');
  await t.sleep(150);
  const onEmptyLine = t.caretRect();
  t.key('ArrowDown');
  await t.sleep(150);
  return {
    emptyLineTop: t.emptyLines()[0]?.top ?? null,
    onEmptyLine,
    afterSecondDown: t.caretRect()
  };
})()
