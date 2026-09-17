/** Picking a square closes the panel and creates that table at the caret. */
(async () => {
  const t = window.__t;
  const button = [...document.querySelectorAll('button')].find(
    (element) => element.getAttribute('aria-label') === 'Insert table'
  );
  await t.load('First paragraph.\n\n');
  await t.click(t.blocks()[0]);
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  button.click();
  await t.sleep(150);
  const panel = button.parentElement.querySelector('.grid-cols-10').parentElement;
  const square = panel.querySelector('button[data-row="3"][data-column="4"]');
  t.report({ open: !panel.className.includes('hidden'), hasSquare: square !== null });
  square.click();
  await t.sleep(350);
  return {
    closed: panel.className.includes('hidden'),
    rows: [...t.prose().querySelectorAll('tr')].map((row) => row.children.length),
    headerCells: t.prose().querySelectorAll('thead th').length,
    bodyCells: t.prose().querySelectorAll('tbody td').length
  };
})()
