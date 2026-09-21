/**
 * The keys that must not damage a table: Delete/Backspace at the edge of a
 * cell, and Enter inside one. Each step reports, because the dev page needs a
 * couple of seconds per interaction.
 */
(async () => {
  const t = window.__t;
  const keyWith = (name, shift = false) =>
    t.scroller().dispatchEvent(
      new KeyboardEvent('keydown', {
        key: name,
        shiftKey: shift,
        bubbles: true,
        cancelable: true
      })
    );
  const cells = () =>
    [...t.prose().querySelectorAll('[data-table-cell]')].map(
      (cell) => `${cell.dataset.tableCell}=${cell.textContent}`
    );
  const steps = {};
  await t.load('| A | B |\n| --- | --- |\n| 1 |  |\n');
  await t.click(t.prose().querySelector('[data-table-cell="1:1"]'));
  steps.before = { cells: cells(), caret: t.caretRect() };
  t.report(steps);
  keyWith('Delete');
  keyWith('Backspace');
  await t.sleep(200);
  steps.afterDelete = { cells: cells(), caret: t.caretRect() };
  t.report(steps);
  keyWith('Enter');
  await t.sleep(200);
  steps.afterEnter = cells();
  t.report(steps);
  keyWith('Tab');
  await t.sleep(250);
  steps.afterTab = { caret: t.caretRect(), cells: cells() };
  t.report(steps);
  keyWith('Tab', true);
  await t.sleep(250);
  steps.afterShiftTab = t.caretRect();
  return steps;
})()
