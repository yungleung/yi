/** Tab on a task item nests it as a real sub-list of the item above. */
(async () => {
  const t = window.__t;
  const shape = () => ({
    lists: t.prose().querySelectorAll('ul').length,
    nestedLists: t.prose().querySelectorAll('ul ul').length,
    checkboxes: t.prose().querySelectorAll('input[type="checkbox"]').length,
    items: t.prose().querySelectorAll('li').length
  });
  await t.load('- [ ] a\n- [ ] b\n');
  await t.click(t.prose().querySelectorAll('li')[1]);
  const before = shape();
  t.report({ before });
  t.scroller().dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
  );
  await t.sleep(300);
  const after = shape();
  t.report({ before, after });
  return { before, after };
})()
