/**
 * The keyboard goes back to the seat after the caret is moved with the keyboard, so the next word
 * composes.
 *
 * An arrow key is not an edit and not a click: it moves the caret, and the field kept the keyboard
 * — with a stale input context. Measured with the real Chinese method, the first letter typed
 * after walking the caret down arrived as a Latin keystroke (`keyCode` 78, `composing` false) and
 * went into the document, where the same keystroke after the hand-back arrives as `229` with
 * `composing` true and opens a composition. It is the third path of one fact — a click, an undo
 * and now the arrow keys each had to give the field back its keyboard — and the caret is where
 * they meet (`composition/input.ts: regainKeyboard`).
 *
 * That the method composes is not something a probe can fake, so this holds the half that is
 * observable: the seat blurs and takes the keyboard again once the key is over.
 *
 * @covers src/ui/markdown/editor/keyboard.ts: handleArrowKey
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const seam = () => document.querySelector('.markdown-composition-input');

  const tall = Array.from({ length: 30 }, (_, index) => `line ${index}`).join('\n\n') + '\n';
  await t.load(tall);
  await t.sleep(200);
  await t.click(t.blocks()[0], 0.5, 0.2);
  await t.sleep(200);
  check('the seat holds the keyboard to start with', document.activeElement === seam(), true);

  let blurs = 0;
  let focuses = 0;
  seam().addEventListener('blur', () => {
    blurs += 1;
  });
  seam().addEventListener('focus', () => {
    focuses += 1;
  });
  t.key('ArrowDown');
  await t.sleep(250);
  check('and the seat took it again after the arrow key', focuses >= 1 && blurs >= 1, true);
  check('and holds it', document.activeElement === seam(), true);

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
