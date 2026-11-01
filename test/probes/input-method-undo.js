/**
 * The keyboard goes back to the seat after an undo, so the next word composes.
 *
 * An undo is a change like any other — but it is not an *edit*: it does not go through
 * `applyEdit`, so it never reached `onChanged`, and nothing handed the keyboard back to the
 * seam. A field that keeps a stale input context is not in the input method: measured with the
 * real Chinese method, the first letter typed after ⌘Z was delivered to the page as a Latin
 * keystroke (`keyCode` 78, `composing` false) and typed into the document, where the same
 * keystroke after the hand-back arrives as `229` with `composing` true and opens a composition.
 *
 * That the method composes is not something a probe can fake — a synthetic key types nothing
 * into a field — so this holds the half that is observable: the seat blurs and takes the
 * keyboard again once the undo's turn is over, which is the hand-back an edit already gets.
 *
 * @covers src/ui/markdown/editor_history.ts: applyEditorHistory
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const seam = () => document.querySelector('.markdown-composition-input');

  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);
  const area = seam();
  area.value = '你好';
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  area.dispatchEvent(new CompositionEvent('compositionend', { data: '你好', bubbles: true }));
  await t.sleep(300);
  check('the word committed', await t.raw(), 'hello你好\n');
  check('with the keyboard on the seat', document.activeElement === seam(), true);

  let blurs = 0;
  let focuses = 0;
  area.addEventListener('blur', () => {
    blurs += 1;
  });
  area.addEventListener('focus', () => {
    focuses += 1;
  });
  await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'undo' });
  await t.sleep(250);
  check('the undo took the word back', await t.raw(), 'hello\n');
  check('and the seat took the keyboard again', focuses >= 1 && blurs >= 1, true);
  check('and holds it', document.activeElement === seam(), true);

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
