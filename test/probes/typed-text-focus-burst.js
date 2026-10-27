/**
 * A fast keyboard burst reaches editable text even while the input seam regains focus.
 *
 * @covers src/ui/markdown/editing/composition_input.ts,
 *   src/ui/markdown/markdown_editor.ts, src/ui/markdown/editing/text_commands.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const press = (key) => {
    const target = document.activeElement ?? document.body;
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    );
  };

  await t.load('Alpha\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(250);
  const seam = document.querySelector('.markdown-composition-input');
  let focusLosses = 0;
  document.addEventListener(
    'focusout',
    (event) => {
      if (event.target === seam) {
        focusLosses += 1;
      }
    },
    true
  );
  for (const character of 'quick') {
    press(character);
  }
  await t.sleep(250);
  check('a burst in a paragraph keeps every character', await t.raw(), 'Alphaquick\n');
  check('and it never resets the input seam', focusLosses, 0);

  await t.load('Alpha\n\nBeta\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(250);
  press('ArrowDown');
  for (const character of 'quick') {
    press(character);
  }
  await t.sleep(250);
  check('a burst after an arrow keeps every character', await t.raw(), 'Alpha\n\nBetaquick\n');

  await t.load('Alpha\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(250);
  document.activeElement?.blur();
  await t.sleep(50);
  for (const character of 'quick') {
    press(character);
  }
  await t.sleep(250);
  check(
    'a burst with the page focused keeps every character while the caret lives',
    await t.raw(),
    'Alphaquick\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
