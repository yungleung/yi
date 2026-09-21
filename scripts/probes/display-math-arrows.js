/**
 * Arrow keys around and through a display formula: nothing throws, the caret
 * is rendered after every move, and the document is untouched.
 *
 * A formula's rendering holds no text a caret can stand in, so a move may
 * enter the block (which then shows its own text, as clicking it does) or pass
 * over it, the way it passes over an image. Both are fine; what must never
 * happen is a lost caret or a thrown error.
 */
(async () => {
  const t = window.__t;
  const errors = [];
  window.addEventListener('error', (event) => errors.push(String(event.message)));
  window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const doc = 'before\n\n$$\n\\frac{a}{b}\n+ c\n$$\n\nafter\n';
  await t.load(doc);
  const steps = [];
  const record = (label) => {
    steps.push({
      label,
      caret: t.caretRect(),
      sourceOpen: t.prose().querySelector('.markdown-source-text') !== null
    });
    t.report({ steps, errors });
  };
  const move = async (key) => {
    t.key(key);
    await t.sleep(120);
  };

  await t.click(t.prose().querySelector('.markdown-block'), 0.5);
  record('clicked the paragraph above');
  await move('ArrowDown');
  record('one down');
  await move('ArrowDown');
  record('two down');
  await move('ArrowUp');
  record('up again');
  await move('ArrowUp');
  record('up once more');

  check('the arrow keys never throw', errors, []);
  checks.push({
    name: 'the caret is rendered after every move',
    actual: steps.map((step) => step.caret !== null),
    expected: [true, true, true, true, true],
    pass: steps.every((step) => step.caret !== null)
  });
  check('the document is untouched', await t.raw(), doc);
  return { checks, steps, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
