/**
 * A letter an input method passes straight through is written once, not twice.
 *
 * With Caps Lock on, a Chinese input method does not compose: it hands the letter on.
 * Two things then carry the very same letter — a `keydown` the method routed, marked
 * by `keyCode` 229 with no composition behind it, and the `input` the method leaves in
 * the seam. The editor must not write it from both. Measured with the real method:
 * three letters typed left four characters in the document.
 *
 * The narrowing this guard used to have is the other half: a `keyCode` 229 key that is
 * *not* a character — `Enter`, pressed while a method is merely active — is still the
 * editor's, and must still start a line.
 *
 * @covers src/ui/markdown/markdown_editor.ts: handleKeydown, src/ui/markdown/editing/composition_input.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const seam = () => document.querySelector('.markdown-composition-input');

  /** A key the input method routed: the method's own marker, no composition behind it. */
  const routed = (key, keyCode) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'keyCode', { value: keyCode });
    t.scroller().dispatchEvent(event);
    return event;
  };
  /** What the method leaves in the seam, which is the other half of the same letter. */
  const inSeam = (text) => {
    seam().value = text;
    seam().dispatchEvent(new InputEvent('input', { data: text, inputType: 'insertText', bubbles: true }));
  };

  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);

  // The seam keeps its state between probes, and `input-method-escape.js` leaves a
  // `compositionstart` behind (a cancelled composition fires `compositionend` in a real
  // one). Put it back at rest, so this probe says nothing about the probe before it.
  seam().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  await t.sleep(50);

  routed('b', 229);
  await t.sleep(60);
  inSeam('b');
  await t.sleep(250);
  check('the letter the method routed is written once', await t.raw(), 'hello' + 'b\n');

  // The other half of the narrowing: a 229 key that is not a character is the editor's.
  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);
  routed('Enter', 229);
  await t.sleep(250);
  check('a 229 Enter still starts a line', await t.raw(), 'hello\n\n');

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
