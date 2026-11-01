/**
 * Enter at the end of the default warning callout's last list item continues
 * the list without moving or deleting any earlier document text.
 *
 * @covers test/fixtures/workspace/default-document.md,
 *   src/ui/markdown/editing/text/index.ts
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

  let item = null;
  for (let fraction = 0.15; item === null && fraction <= 0.75; fraction += 0.1) {
    t.scroller().scrollTop = t.scroller().scrollHeight * fraction;
    await t.sleep(120);
    item = [...t.prose().querySelectorAll('li')].find(
      (candidate) => candidate.textContent?.includes('Second check')
    ) ?? null;
  }
  const before = await t.raw();
  check('the warning callout list is mounted', item !== null, true);
  if (item !== null) {
    await t.click(item, 0.99);
    t.key('Enter');
    await t.sleep(250);
  }
  const after = await t.raw();
  const expected = before.replace(
    '> - Second check\n',
    '> - Second check\n> - \n'
  );
  check('Enter appends one sibling item in the quoted callout', after === expected, true);
  check('all text before the list survives', after.startsWith(before.slice(0, before.indexOf('> - Second check'))), true);
  check('all text after the list survives', after.endsWith(before.slice(before.indexOf('> - Second check') + 18)), true);

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
