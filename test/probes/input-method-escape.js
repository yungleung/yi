/**
 * Escape while an input method is composing cancels the composition, and nothing else.
 *
 * Every floating surface puts itself away on Escape (`floating/surface.ts`), and the
 * key a composition is cancelled with reaches them too. The reader who asked for the
 * composition to go away did not ask for the message they are reading to go with it.
 *
 * @covers src/ui/floating/surface.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const { notify } = await t.app('/src/services/messages.ts');
  const card = () => document.querySelector('[data-message]');
  const seam = () => document.querySelector('.markdown-composition-input');

  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(150);
  notify('probe', new Error('the message the composition must not close'));
  await t.sleep(250);
  check('the message is open', card() !== null, true);

  const area = seam();
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  area.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true })
  );
  await t.sleep(250);
  check('the cancelled composition left the message alone', card() !== null, true);

  // And the surface still answers an Escape of its own.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await t.sleep(250);
  check('a plain Escape still puts it away', card() === null, true);

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
