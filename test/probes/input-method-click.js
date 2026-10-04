/**
 * A click that places the caret leaves the keyboard on the seat, not on the page.
 *
 * A click the reader makes is not one event but four: `pointerdown` (the hand-over stands
 * back for the gesture), the browser focusing the focusable page the pointer is on,
 * `pointerup`, and the click that places the caret. The keyboard ends where the browser
 * put it — on the page — and a field that is not the keyboard's is not in the input
 * method either: the first letter typed after such a click is delivered to the page's own
 * key path and lands as a Latin character, with the composition only beginning with the
 * second (measured with the real method: `nihao` came out `ni` and 好, so the word could
 * not be written at all). Handing it back a turn later gives `你好`.
 *
 * That the method composes is not something a probe can fake (a synthetic key types
 * nothing into a field), so this holds the half that is observable: after the whole
 * sequence, the keyboard is the seat's again and the caret is where the click put it.
 *
 * @covers src/ui/markdown/editing/composition_input.ts: regainKeyboard
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const seam = () => document.querySelector('.markdown-composition-input');

  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.5, 0.5);
  await t.sleep(200);
  check('the seat holds the keyboard to start with', document.activeElement === seam(), true);

  // The reader's click, in the order the browser delivers it.
  const node = t.blocks()[0].querySelector('.markdown-node');
  const rect = node.getBoundingClientRect();
  const at = { clientX: rect.left + rect.width * 0.99, clientY: rect.top + rect.height / 2 };
  t.scroller().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  t.prose().focus({ preventScroll: true });
  check('the gesture leaves the keyboard on the page', document.activeElement === seam(), false);
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  node.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, ...at })
  );
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  check(
    'and the seat has it once the click has placed the caret',
    document.activeElement === seam(),
    true
  );

  const caret = t.caretRect();
  check('with the caret where the click put it', caret !== null && Math.abs(caret.y - rect.top) <= 40, true);

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
