/** Picking a square closes the panel and creates that table at the caret. */
(async () => {
  const t = window.__t;
  await t.load('First paragraph.\n\n');
  await t.click(t.blocks()[0]);
  await t.toolbarAction('Insert table');
  const panel = document.querySelector('[data-table-picker]');
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
