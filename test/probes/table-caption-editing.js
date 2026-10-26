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
  const separatedMargin = caption === null ? null : getComputedStyle(caption).marginTop;
  check('the table and caption are one block', block?.classList.contains('markdown-table-block') ?? false, true);
  check('the block carries the target ID', block?.id ?? null, 'tbl:results');
  check('the caption carries its generated label', caption?.querySelector('.markdown-table-number')?.textContent ?? null, 'Table 1.');
  check('the caption carries its text', caption?.textContent?.trim() ?? null, 'Table 1. Results');
  check(
    'the source separator is not rendered as an element',
    [t.prose().querySelector('.markdown-table-blank') ?? null, caption?.previousElementSibling?.tagName ?? null],
    [null, 'TABLE']
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
  const renderedCaption = t.prose().querySelector('.markdown-table-caption');
  const renderedLabel = renderedCaption?.querySelector('.markdown-table-number');
  if (renderedLabel) {
    await t.click(renderedLabel, 0.5);
    await t.sleep(250);
  }
  check(
    'clicking the generated label reveals the caption source',
    t.prose().querySelector('.markdown-table-caption-source')?.textContent ?? null,
    source
  );

  await t.load('| A |\n| --- |\n| 1 |\n: Direct {#tbl:direct}\n');
  const direct = t.prose().querySelector('.markdown-table-caption');
  check('a direct caption renders', direct?.textContent?.trim() ?? null, 'Table 1. Direct');
  check(
    'the separator changes nothing about the caption’s rendered spacing',
    direct === null ? null : getComputedStyle(direct).marginTop,
    separatedMargin
  );
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
  await t.click(t.prose().querySelector('.markdown-table-caption'), 0.5);
  for (const _character of ': Separated') {
    t.key('ArrowLeft');
  }
  t.key('Backspace');
  await t.sleep(250);
  check(
    'Backspace at the caption source start removes the source separator',
    await t.raw(),
    '| A |\n| --- |\n| 1 |\n: Separated\n'
  );

  await t.load('| A |\n| --- |\n| 1 |\n: Joined\n');
  await t.click(t.prose().querySelector('.markdown-table-caption'), 0.5);
  for (const _character of ': Joined') {
    t.key('ArrowLeft');
  }
  t.key('Enter');
  await t.sleep(250);
  check(
    'Enter at the caption source start adds the source separator',
    await t.raw(),
    '| A |\n| --- |\n| 1 |\n\n: Joined\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
