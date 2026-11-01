/**
 * A blank line after a table keeps its own caret and source.
 *
 * @covers src/ui/markdown/syntax/table/index.ts,
 *   src/ui/markdown/caret/dom_position.ts
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

  await t.load('| A | B |\n| --- | --- |\n| 1 | 2 |\n\nAfter\n');
  await t.click(t.prose().querySelector('[data-table-cell="1:1"]'), 0.5);
  t.key('Enter');
  await t.sleep(250);
  const afterEnter = await t.raw();
  const blank = t.prose()
    .querySelector('.markdown-empty-line-placeholder')
    ?.closest('.markdown-block');
  if (blank) {
    await t.click(blank, 0.5);
  }
  t.key('x');
  await t.sleep(250);

  check(
    'typing on the blank line stays after the table',
    await t.raw(),
    '| A | B |\n| --- | --- |\n| 1 | 2 |\n\nx\n\nAfter\n'
  );
  check(
    'leaving the table makes a blank line first',
    afterEnter,
    '| A | B |\n| --- | --- |\n| 1 | 2 |\n\n\nAfter\n'
  );
  check(
    'the final cell is unchanged',
    t.prose().querySelector('[data-table-cell="1:1"]')?.textContent ?? null,
    '2'
  );
  check(
    'the caret is outside every cell',
    t.caretRect() !== null &&
      [...t.prose().querySelectorAll('[data-table-cell]')].every((cell) => {
        const box = cell.getBoundingClientRect();
        const caret = t.caretRect();
        return caret !== null && (caret.y < box.top || caret.y > box.bottom);
      }),
    true
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
