/** Typing in an empty cell puts the character in that cell, not elsewhere. */
(async () => {
  const t = window.__t;
  await t.load('| A | B |\n| --- | --- |\n| 1 |  |\n');
  const empty = t.prose().querySelector('[data-table-cell="1:1"]');
  t.report({ found: empty !== null });
  await t.click(empty ?? t.blocks()[0]);
  t.key('x');
  await t.sleep(250);
  const cell = t.prose().querySelector('[data-table-cell="1:1"]');
  return {
    cellText: cell ? cell.textContent : null,
    headerText: t.prose().querySelector('[data-table-cell="0:1"]').textContent,
    caret: t.caretRect()
  };
})()
