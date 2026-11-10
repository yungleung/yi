/**
 * The picker: hovering a square highlights the region it names, and clicking
 * it inserts a table of that size at the caret.
 */
(async () => {
  const t = window.__t;
  await t.load('First paragraph.\n\n');
  await t.click(t.blocks()[0]);
  await t.toolbarAction('Insert table');
  const panel = document.querySelector('[data-table-picker]');
  const square = (row, column) =>
    panel?.querySelector(`button[data-row="${row}"][data-column="${column}"]`) ?? null;
  square(3, 4).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await t.sleep(100);
  const state = {
    open: panel ? !panel.className.includes('hidden') : null,
    label: panel ? panel.querySelector('span').textContent : null,
    highlighted: panel
      ? [...panel.querySelectorAll('button')].filter((element) =>
          element.className.includes('bg-primary')
        ).length
      : null
  };
  t.report(state);
  square(3, 4).click();
  await t.sleep(300);
  const closed = panel ? panel.className.includes('hidden') : null;
  const rows = [...t.prose().querySelectorAll('tr')].map((row) => row.children.length);
  return { ...state, closed, rows };
})()
