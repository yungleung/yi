/**
 * Enter inside a table goes down the column; in a cell with nothing below it
 * (the last row) it leaves the table with an empty paragraph after it.
 */
(async () => {
  const t = window.__t;
  const press = (shift = false) =>
    t.scroller().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: shift, bubbles: true, cancelable: true })
    );
  const shape = () =>
    [...t.prose().querySelectorAll('.markdown-block')].map(
      (block) =>
        block.dataset.lineStart +
        (block.className.includes('markdown-blank') ? ':blank' : ':content')
    );
  const box = (selector) => {
    const rect = t.prose().querySelector(selector).getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom)
    };
  };
  const inBox = (point, rect) =>
    point && rect
      ? point.x >= rect.left - 2 &&
        point.x <= rect.right + 2 &&
        point.y >= rect.top - 2 &&
        point.y <= rect.bottom + 2
      : null;
  const steps = {};

  await t.load('| A | B |\n| --- | --- |\n| 1 | 2 |\n');
  await t.click(t.prose().querySelector('[data-table-cell="0:1"]'));
  steps.headerCell = box('[data-table-cell="0:1"]');
  steps.bodyCell = box('[data-table-cell="1:1"]');
  press();
  await t.sleep(220);
  steps.caretAfterEnter = t.caretRect();
  steps.movedDown = inBox(steps.caretAfterEnter, steps.bodyCell);
  steps.shapeAfterEnter = shape();
  t.report(steps);

  // The caret is in the last row now: the same key leaves the table.
  press();
  await t.sleep(250);
  steps.shapeAfterLeaving = shape();
  steps.caretAfterLeaving = t.caretRect();
  t.report(steps);

  // Shift+Enter is the same key here: a cell holds text, not lines.
  await t.load('| A | B |\n| --- | --- |\n| 1 | 2 |\n');
  await t.click(t.prose().querySelector('[data-table-cell="0:0"]'));
  press(true);
  await t.sleep(220);
  steps.shiftEnterCell = box('[data-table-cell="1:0"]');
  steps.shiftEnterCaret = t.caretRect();
  steps.shiftEnterMovedDown = inBox(steps.shiftEnterCaret, steps.shiftEnterCell);
  return steps;
})()
