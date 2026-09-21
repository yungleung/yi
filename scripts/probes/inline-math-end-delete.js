/**
 * Deleting at the end of an inline formula, then undoing: the flow this area
 * was already known to handle, on a formula with a `\\,` in it.
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const emit = async (name) => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: name });
    await t.sleep(250);
  };
  const doc = 'Inline math: $E = mc^2$ and $\\int_a^b x^2 \\, dx$.\n';
  await t.load(doc);
  const formulas = () => [...t.prose().querySelectorAll('[data-display="false"]')];
  check('both formulas render', formulas().length, 2);
  await t.click(formulas()[1], 0.5);
  const source = t.prose().querySelector('.markdown-math-source');
  check('the formula shows its source', source?.textContent ?? null, '$\\int_a^b x^2 \\, dx$');
  t.key('Backspace');
  await t.sleep(250);
  t.key('Backspace');
  await t.sleep(250);
  check(
    'both deletes land at the end of the formula',
    await t.raw(),
    'Inline math: $E = mc^2$ and $\\int_a^b x^2 \\, $.\n'
  );
  await emit('undo');
  await emit('undo');
  check('and undo puts them back', await t.raw(), doc);
  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
