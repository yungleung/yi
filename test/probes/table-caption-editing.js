/**
 * Table captions render below their table and edit as their own source line.
 *
 * @covers src/ui/markdown/nodes/table_caption.ts,
 *   src/ui/markdown/create_block.ts, src/ui/markdown/syntax/table_captions.ts
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

  const source = ': Results {#tbl:results .margin owner=demo}';
  await t.load(
    '# Table\n\n' +
      'Intro\n\n' +
      '| A | B |\n' +
      '| --- | --- |\n' +
      '| 1 | 2 |\n\n' +
      `${source}\n`
  );
  const block = t.blocks().find((element) => element.textContent.includes('Results'));
  const caption = block?.querySelector('.markdown-table-caption');
  const tableBlank = caption?.previousElementSibling;
  const paragraphGap = Math.round(
    parseFloat(getComputedStyle(t.prose().querySelector('p')).marginBottom)
  );
  check('the table and caption are one block', block?.classList.contains('markdown-table-block') ?? false, true);
  check('the block carries the target ID', block?.id ?? null, 'tbl:results');
  check('the caption carries its generated label', caption?.querySelector('.markdown-table-number')?.textContent ?? null, 'Table 1.');
  check('the caption carries its text', caption?.textContent?.trim() ?? null, 'Table 1. Results');
  check(
    'the optional separator is a normal block gap rather than a visible line',
    Math.round(tableBlank?.getBoundingClientRect().height ?? 0),
    paragraphGap
  );
  check('unrelated classes are not applied to the editor DOM', block?.classList.contains('margin') ?? true, false);

  if (caption) {
    await t.click(caption, 0.5);
    await t.sleep(250);
  }
  check(
    'clicking the caption reveals its complete source',
    t.prose().querySelector('.markdown-table-caption-source')?.textContent ?? null,
    source
  );
  t.key('!');
  await t.sleep(250);
  check(
    'typing edits the caption line, not a table cell',
    t.prose().querySelector('.markdown-table-caption-source')?.textContent ?? null,
    `${source}!`
  );
  t.key('Backspace');
  await t.sleep(250);

  await t.click(t.prose().querySelector('h1'), 0.5);
  await t.sleep(250);
  check(
    'leaving the caption restores its rendering',
    t.prose().querySelector('.markdown-table-caption')?.textContent?.trim() ?? null,
    'Table 1. Results'
  );

  await t.load('| A |\n| --- |\n| 1 |\n: Direct {#tbl:direct}\n');
  const direct = t.prose().querySelector('.markdown-table-caption');
  check('a direct caption renders', direct?.textContent?.trim() ?? null, 'Table 1. Direct');
  if (direct) {
    await t.click(direct, 0.5);
    await t.sleep(250);
  }
  check(
    'a direct caption is editable as a line',
    t.prose().querySelector('.markdown-table-caption-source')?.textContent ?? null,
    ': Direct {#tbl:direct}'
  );

  await t.load('| A |\n| --- |\n| 1 |\n\n: Separated\n');
  const separated = t.prose().querySelector('.markdown-table-blank');
  if (separated) {
    await t.click(separated, 0.5);
    t.key('x');
    await t.sleep(250);
  }
  check(
    'the invisible gap still accepts the caret and edits its source line',
    await t.raw(),
    '| A |\n| --- |\n| 1 |\nx\n: Separated\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
