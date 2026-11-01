/**
 * A letter an input method passes straight through is written once, not twice.
 *
 * With Caps Lock on, a Chinese input method does not compose: it hands the letter on.
 * Two things then carry the very same letter — a `keydown` the method routed, marked
 * by `keyCode` 229 with no composition behind it, and the `input` the method leaves in
 * the seam. The editor must not write it from both. Measured with the real method:
 * three letters typed left four characters in the document.
 *
 * The narrowing this guard has is the other half: only `keyCode` 229 delegates a
 * character to the seam. Caps Lock on its own is ordinary editor input, even when the
 * English source supplies an upper-case `key`; routing it to the native textarea leaves
 * stale context across a later source switch. A 229 key that carries no character is
 * still the editor's.
 *
 * @covers src/ui/markdown/markdown_editor.ts: handleKeydown,
 *   src/ui/markdown/editing/keys.ts, src/ui/markdown/editing/composition/input.ts
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
  /** An ordinary Caps Lock keydown, not delegated by an input method. */
  const capsKey = (key, keyCode) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'keyCode', { value: keyCode });
    Object.defineProperty(event, 'getModifierState', {
      value: (modifier) => modifier === 'CapsLock'
    });
    t.scroller().dispatchEvent(event);
    return event;
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

  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);
  routed('B', 229);
  inSeam('B');
  await t.sleep(250);
  check('a 229-routed Caps Lock letter is normalized by the method path', await t.raw(), 'hellob\n');

  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);
  const capA = capsKey('A', 65);
  await t.sleep(250);
  check('ordinary Caps Lock text is editor input', capA.defaultPrevented, true);
  check('and stays upper-case', await t.raw(), 'hello' + 'A\n');

  // A space and a source switch after editor-handled Caps Lock text must not leave a
  // native textarea context behind. The Chinese composition then starts normally.
  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);
  capsKey('A', 65);
  t.key(' ');
  capsKey('B', 66);
  seam().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  seam().value = 'ni';
  seam().dispatchEvent(new CompositionEvent('compositionupdate', { data: 'ni', bubbles: true }));
  seam().value = '你';
  seam().dispatchEvent(new CompositionEvent('compositionend', { data: '你', bubbles: true }));
  await t.sleep(250);
  check('a source switch after Caps Lock starts a composition', await t.raw(), 'helloA B你\n');

  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);
  const shifted = new KeyboardEvent('keydown', {
    key: 'D',
    shiftKey: true,
    bubbles: true,
    cancelable: true
  });
  Object.defineProperty(shifted, 'keyCode', { value: 68 });
  t.scroller().dispatchEvent(shifted);
  await t.sleep(250);
  check('a Shift-typed capital remains the editor’s key', shifted.defaultPrevented, true);

  // Clearing the explicitly routed native field inside one input event makes WebKit
  // refuse the next insertion at the same caret. Three native insertions must all reach
  // the document without another click.
  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);
  const inserted = [];
  for (const [key, lower] of [
    ['A', 'a'],
    ['B', 'b'],
    ['C', 'c']
  ]) {
    routed(key, 229);
    inserted.push(document.execCommand('insertText', false, lower));
    await t.sleep(80);
  }
  await t.sleep(250);
  check('every consecutive Caps Lock character reaches the seam', [...inserted], [true, true, true]);
  check('continuous typing stays at the same caret', await t.raw(), 'helloabc\n');

  t.key(' ');
  routed('D', 229);
  inserted.push(document.execCommand('insertText', false, 'd'));
  await t.sleep(250);
  check('a space does not end the native Caps Lock burst', inserted, [true, true, true, true]);
  check('typing resumes after the space', await t.raw(), 'helloabc d\n');

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
