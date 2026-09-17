/**
 * Shift+Enter in the table's last cell starts an empty paragraph below the
 * table; anywhere else in the table it leaves the table alone.
 */
(async () => {
  const t = window.__t;
  const keyWith = (name, shift) =>
    t.scroller().dispatchEvent(
      new KeyboardEvent('keydown', { key: name, shiftKey: shift, bubbles: true, cancelable: true })
    );
  const doc = '| A | B |\n| --- | --- |\n| 1 | 2 |\n';
  const steps = {};
  await t.load(doc);
  await t.click(t.prose().querySelector('[data-table-cell="1:1"]'));
  keyWith('Enter', true);
  await t.sleep(250);
  steps.afterLastCell = { caret: t.caretRect(), emptyLines: t.emptyLines().length };
  t.report(steps);
  steps.lastCellRaw = await t.raw();
  t.report(steps);
  await t.load(doc);
  await t.click(t.prose().querySelector('[data-table-cell="0:0"]'));
  keyWith('Enter', true);
  await t.sleep(250);
  steps.middleCellRaw = await t.raw();
  return steps;
})()
