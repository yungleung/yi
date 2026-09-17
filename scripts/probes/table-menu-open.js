/**
 * Opens the table's context menu on a cell.
 *
 * The native menu blocks the webview while it is open, so this probe's last
 * statement is the right-click itself: the reply is already on its way when
 * the menu appears, and the screenshot script captures what is on screen.
 */
(async () => {
  const t = window.__t;
  await t.load('| A | B |\n| --- | --- |\n| 1 | 2 |\n');
  const cell = t.prose().querySelector('[data-table-cell="1:1"]');
  const rect = cell.getBoundingClientRect();
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: Math.round(rect.left + rect.width / 2),
    clientY: Math.round(rect.top + rect.height / 2)
  });
  cell.dispatchEvent(event);
  return { prevented: event.defaultPrevented, hasCell: cell !== null };
})()
