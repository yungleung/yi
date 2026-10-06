/**
 * A click outside the editor takes the selection away with the caret.
 *
 * The failure this guards against is a bad one: a selection the reader can no longer see that the
 * next keystroke replaces, losing the words it covered. The app clears the *caret* on such a click
 * itself (`caret/caret.ts`), and the browser clears the *selection*; the editor's own selection
 * state follows the native selection (`markdown_editor.ts`). A probe cannot drive a real mouse
 * click, but the browser's half of one is two facts — the click, and an emptied selection — and the
 * second half is what the caret's own state follows.
 *
 * The other half is held too: while a selection *is* live, typing replaces it, as it does in any
 * editor (`selection-live.js` readers: the harness's own `raw()` deselects nothing, so a probe that
 * reads the document and then types without clicking has a live selection — see `test/README.md`).
 *
 * @covers src/ui/markdown/caret/caret.ts, src/ui/markdown/markdown_editor.ts
 */
(async () => {
  const t = window.__t;
  const caret = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });

  /** Selects the whole document the way the menu's Select All does. */
  const selectAll = async () => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'select_all' });
    await t.sleep(400);
  };

  await t.load('first line\n\nsecond line\n');
  await t.sleep(300);
  await t.click(t.prose().querySelector('p'), 0.5, 0.5);
  await t.sleep(250);
  await selectAll();
  check('Select All leaves the document selected', caret.getSelectionRange() !== null, true);
  check('with the caret still where it was', caret.getCaretRange() !== null, true);

  // A click outside the editor, as the browser delivers one: the click, and an emptied selection.
  const outside = document.body.firstElementChild.lastElementChild;
  outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  window.getSelection()?.removeAllRanges();
  outside.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  outside.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 600, clientY: 790 }));
  await t.sleep(400);
  check('a click outside puts the caret away', t.caretRect(), null);
  check('and the selection goes with it', caret.getSelectionRange(), null);
  t.key('y');
  await t.sleep(300);
  check('so typing writes nothing', await t.raw(), 'first line\n\nsecond line\n');

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
