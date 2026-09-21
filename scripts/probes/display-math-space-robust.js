/**
 * A space typed at the end of a display formula's last line stays where it was
 * typed: the caret is after it, so the next keystroke lands after it too.
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const doc = ['Display math:', '', '$$', '\\frac{d}{dx}(\\sin x) = \\cos x \\\\', 'e^{i 2\\pi} = 1', '$$', '', 'after'].join('\n') + '\n';
  await t.load(doc);
  await t.click(t.prose().querySelector('[data-display="true"]'), 0.5, 0.5);
  const source = () => t.prose().querySelector('.markdown-source-text');
  check('the formula shows its own text', source()?.textContent ?? null, '$$\n\\frac{d}{dx}(\\sin x) = \\cos x \\\\\ne^{i 2\\pi} = 1\n$$');
  t.key(' ');
  await t.sleep(300);
  t.key('X');
  await t.sleep(300);
  check(
    'both keystrokes land on the last content line',
    await t.raw(),
    ['Display math:', '', '$$', '\\frac{d}{dx}(\\sin x) = \\cos x \\\\', 'e^{i 2\\pi} = 1 X', '$$', '', 'after'].join('\n') + '\n'
  );
  check(
    'and the source shows them',
    source()?.textContent ?? null,
    '$$\n\\frac{d}{dx}(\\sin x) = \\cos x \\\\\ne^{i 2\\pi} = 1 X\n$$'
  );
  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
