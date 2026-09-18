/** Shift+Tab lifts a nested item back out to its parent's level. */
(async () => {
  const t = window.__t;
  const shape = () => ({
    topLevelItems: t.prose().querySelector('ul')?.children.length ?? 0,
    lists: t.prose().querySelectorAll('ul').length,
    items: t.prose().querySelectorAll('li').length
  });
  await t.load('- one\n  - two\n');
  await t.click(t.prose().querySelectorAll('li')[1]);
  const before = shape();
  t.scroller().dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
  );
  await t.sleep(300);
  return { before, after: shape() };
})()
