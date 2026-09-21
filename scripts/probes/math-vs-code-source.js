/**
 * The same keystroke in both kinds of block: a space at the end of a line.
 *
 * A fenced code block and a display formula being edited are both the raw text
 * of the block, so the two should behave alike: the space reaches the document,
 * shows in what is rendered, and leaves the caret after it.
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  await t.load('text\n\n```ts\nlet a = 1;\nlet b = 2;\n```\n\n$$\n\\frac{a}{b}\n$$\n');

  // A fenced code block is always shown as its source: click its last line and
  // type a space.
  const code = t.prose().querySelector('pre');
  await t.click(code, 0.99, 0.9);
  t.key(' ');
  await t.sleep(300);
  check(
    'the space lands at the end of the code line',
    await t.raw(),
    'text\n\n```ts\nlet a = 1;\nlet b = 2; \n```\n\n$$\n\\frac{a}{b}\n$$\n'
  );

  // The formula shows its own text once it is clicked, with the caret at the
  // end of its last content line.
  await t.click(t.prose().querySelector('[data-display="true"]'), 0.5, 0.5);
  check(
    'the formula shows its own text',
    t.prose().querySelector('.markdown-source-text')?.textContent ?? null,
    '$$\n\\frac{a}{b}\n$$'
  );
  t.key(' ');
  await t.sleep(300);
  check(
    'the space lands at the end of the formula line',
    await t.raw(),
    'text\n\n```ts\nlet a = 1;\nlet b = 2; \n```\n\n$$\n\\frac{a}{b} \n$$\n'
  );
  checks.push({
    name: 'and the space shows in the source',
    actual: t.prose().querySelector('.markdown-source-text')?.textContent ?? null,
    expected: '$$\n\\frac{a}{b} \n$$',
    pass: (t.prose().querySelector('.markdown-source-text')?.textContent ?? null) === '$$\n\\frac{a}{b} \n$$'
  });
  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
