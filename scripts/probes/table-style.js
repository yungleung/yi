/** Borders on every side, a cell minimum width, and a centred table. */
(async () => {
  const t = window.__t;
  await t.load('| A | B |\n| --- | --- |\n| 1 |  |\n');
  const table = t.prose().querySelector('table.markdown-table');
  const cells = [...t.prose().querySelectorAll('table.markdown-table th, table.markdown-table td')];
  const style = getComputedStyle(cells[0]);
  const tableRect = table.getBoundingClientRect();
  const scrollerRect = t.scroller().getBoundingClientRect();
  return {
    tableWidth: Math.round(tableRect.width),
    scrollerWidth: Math.round(scrollerRect.width),
    leftGap: Math.round(tableRect.left - scrollerRect.left),
    rightGap: Math.round(scrollerRect.right - tableRect.right),
    borders: [
      style.borderTopWidth + ' ' + style.borderTopStyle,
      style.borderRightWidth + ' ' + style.borderRightStyle,
      style.borderBottomWidth + ' ' + style.borderBottomStyle,
      style.borderLeftWidth + ' ' + style.borderLeftStyle
    ],
    borderColor: style.borderTopColor,
    cellWidths: cells.map((cell) => Math.round(cell.getBoundingClientRect().width)),
    cellMinWidth: getComputedStyle(t.prose().querySelector('.markdown-table-cell')).minWidth
  };
})()
