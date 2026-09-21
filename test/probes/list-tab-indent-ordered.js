/** Tab on an ordered item nests it as a real sub-list of the item above. */
(async () => {
  const t = window.__t;
  const shape = () => ({
    lists: t.prose().querySelectorAll('ol').length,
    nestedLists: t.prose().querySelectorAll('ol ol').length,
    items: t.prose().querySelectorAll('li').length,
    texts: [...t.prose().querySelectorAll('li')].map((item) => item.textContent)
  });
  await t.load('1. one\n2. two\n');
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
