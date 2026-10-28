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
 * editor's, and must still start a line. Caps Lock can also arrive on an ordinary keydown
 * whose `key` has the lock's case while the seam has the method's lower-case character;
 * that key belongs to the method, while a modified command shortcut still belongs to us.
 *
 * @covers src/ui/markdown/markdown_editor.ts: handleKeydown,
 *   src/ui/markdown/editing/keys.ts, src/ui/markdown/editing/composition_input.ts
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
  /** A normal Caps Lock keydown whose character the method supplies lower-case in the seam. */
  const capsLockRouted = (key, keyCode) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'keyCode', { value: keyCode });
    Object.defineProperty(event, 'getModifierState', {
      value: (modifier) => modifier === 'CapsLock'
    });
    t.scroller().dispatchEvent(event);
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

  // Caps Lock changes the `key` of an otherwise ordinary keydown, while the input method's
  // committed text is still lower-case. The editor must let that one reach the seam too.
  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);
  capsLockRouted('B', 66);
  inSeam('b');
  await t.sleep(250);
  check('a Caps Lock key keeps the method’s own case', await t.raw(), 'hello' + 'b\n');

  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);
  capsLockRouted('A', 65);
  inSeam('A');
  await t.sleep(250);
  check('and ordinary Caps Lock text stays upper-case', await t.raw(), 'hello' + 'A\n');

  // Clearing the native field inside one input event makes WebKit refuse the next
  // insertion at the same caret. Three native insertions must therefore all reach the
  // document without another click.
  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);
  const inserted = [];
  for (const [key, code, lower] of [
    ['A', 65, 'a'],
    ['B', 66, 'b'],
    ['C', 67, 'c']
  ]) {
    capsLockRouted(key, code);
    inserted.push(document.execCommand('insertText', false, lower));
    await t.sleep(80);
  }
  await t.sleep(250);
  check('every consecutive Caps Lock character reaches the seam', inserted, [true, true, true]);
  check('continuous typing stays at the same caret', await t.raw(), 'helloabc\n');

  const selectAll = new KeyboardEvent('keydown', {
    key: 'a',
    metaKey: true,
    bubbles: true,
    cancelable: true
  });
  Object.defineProperty(selectAll, 'keyCode', { value: 65 });
  Object.defineProperty(selectAll, 'getModifierState', {
    value: (modifier) => modifier === 'CapsLock'
  });
  t.scroller().dispatchEvent(selectAll);
  check('Caps Lock does not take a command shortcut from the editor', selectAll.defaultPrevented, true);

  // The other half of the narrowing: a 229 key that is not a character is the editor's.
  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);
  routed('Enter', 229);
  await t.sleep(250);
  check('a 229 Enter still starts a line', await t.raw(), 'hello\n\n');

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
