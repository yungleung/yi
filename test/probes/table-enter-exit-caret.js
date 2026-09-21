/**
 * Enter in the last cell of a column when the table is followed by more
 * document: the caret has to land on the empty line that was created below the
 * table, not back in the table.
 */
(async () => {
  const t = window.__t;
  const doc = 'para\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n## Heading\n\ntail\n';
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom)
    };
  };
  const step = {};
  await t.load(doc);
  await t.click(t.prose().querySelector('[data-table-cell="1:1"]'));
  step.caretBefore = t.caretRect();
  t.scroller().dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  );
  await t.sleep(300);
  const blanks = [...t.prose().querySelectorAll('.markdown-blank')];
  const cells = [...t.prose().querySelectorAll('[data-table-cell]')];
  step.blankCount = blanks.length;
  step.blankBox = blanks.length > 0 ? box(blanks[blanks.length - 1]) : null;
  step.caret = t.caretRect();
  step.cells = cells.map((cell) => ({ cell: cell.dataset.tableCell, ...box(cell) }));
  step.onTheNewLine =
    step.caret && step.blankBox
      ? step.caret.y >= step.blankBox.top - 2 && step.caret.y <= step.blankBox.bottom + 2
      : null;
  step.outsideEveryCell =
    step.caret && cells.length > 0
      ? cells.every((cell) => {
          const rect = box(cell);
          return (
            step.caret.x < rect.left - 2 ||
            step.caret.x > rect.right + 2 ||
            step.caret.y < rect.top - 2 ||
            step.caret.y > rect.bottom + 2
          );
        })
      : null;
  t.report(step);
  return step;
})()
