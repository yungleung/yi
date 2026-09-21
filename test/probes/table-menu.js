/**
 * A right-click inside a cell is handled by the editor (and opens the native
 * menu); a right-click outside a cell is left to the webview.
 *
 * @needs-foreground-window — it opens the table menu, which a scripted run
 * cannot close, so `probe:all` skips it: run it by name with the window in
 * front.
 */
(async () => {
  const t = window.__t;
  await t.load('| A | B |\n| --- | --- |\n| 1 | 2 |\n');
  const cell = t.prose().querySelector('[data-table-cell="1:1"]');
  const rect = cell.getBoundingClientRect();
  const inside = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: Math.round(rect.left + rect.width / 2),
    clientY: Math.round(rect.top + rect.height / 2)
  });
  cell.dispatchEvent(inside);
  t.report({ prevented: inside.defaultPrevented });
  await t.sleep(400);
  const outside = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  // Outside a cell: the block around the table, which exists whatever the
  // document is (this probe used to reach for a <p>, which a table-only
  // document does not have — it threw, and the harness's timeout recovery read
  // the partial stash as a pass).
  t.prose().querySelector('.markdown-block').dispatchEvent(outside);
  return { prevented: inside.defaultPrevented, outsidePrevented: outside.defaultPrevented };
})()
