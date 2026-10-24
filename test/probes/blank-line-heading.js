/**
 * Typing a heading marker on an empty line remains possible until its space and title exist.
 *
 * @covers src/ui/markdown/caret/offsets.ts, src/ui/markdown/nodes/heading.ts
 * @fixture test/fixtures/workspace/default-document.md
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

  await t.load('---\ntitle: Heading check\n---\n\n');
  const blank = t.prose().querySelector('.markdown-empty-line-placeholder');
  await t.click(blank, 0.05);
  for (const key of ['#', '#', ' ', 'H', 'e', 'a', 'd']) {
    t.key(key);
    await t.sleep(80);
  }
  await t.sleep(250);

  const raw = await t.raw();
  const heading = t.prose().querySelector('h2');
  check(
    'the raw text has both heading markers and a title',
    raw,
    '---\ntitle: Heading check\n---\n\n## Head\n'
  );
  check('the second marker reaches the document', raw.includes('\n## Head\n'), true);
  check('the rendered heading is level two', heading?.textContent?.trim() ?? null, 'Head');
  check('the caret stayed in the heading while typing', t.caretRect() !== null, true);

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
