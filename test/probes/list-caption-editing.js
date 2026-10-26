/**
 * List captions render below their list and edit as their own source line.
 *
 * @covers src/ui/markdown/nodes/list_caption.ts,
 *   src/ui/markdown/create_block.ts, src/ui/markdown/syntax/list_captions.ts
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

  const source = ': Steps {#list:steps .wide owner=demo}';
  await t.load(
    '# Lists\n\n' +
      'Intro\n\n' +
      '- First item\n' +
      '- Second item\n\n' +
      `${source}\n`
  );
  const block = t.blocks().find((element) => element.textContent.includes('Steps'));
  const caption = block?.querySelector('.markdown-list-caption');
  const separatedMargin = caption == null ? null : getComputedStyle(caption).marginTop;
  check(
    'the list and caption are one block',
    block?.classList.contains('markdown-list-block') ?? false,
    true
  );
  check('the block carries the target ID', block?.id ?? null, 'list:steps');
  check(
    'the caption carries its generated label',
    caption?.querySelector('.markdown-list-number')?.textContent ?? null,
    'List 1.'
  );
  check('the caption carries its text', caption?.textContent?.trim() ?? null, 'List 1. Steps');
  check(
    'the source separator is not rendered as an element',
    [
      t.prose().querySelector('.markdown-list-blank') ?? null,
      caption?.previousElementSibling?.tagName ?? null
    ],
    [null, 'UL']
  );
  check(
    'unrelated classes are not applied to the editor DOM',
    block?.classList.contains('wide') ?? true,
    false
  );
  const captionPoint =
    caption === null
      ? null
      : (() => {
          const rect = caption.getBoundingClientRect();
          return {
            x: rect.left + rect.width * 0.5,
            y: rect.top + rect.height * 0.5
          };
        })();
  const captionHit =
    captionPoint === null
      ? null
      : document.elementFromPoint(captionPoint.x, captionPoint.y)?.closest(
          '.markdown-list-caption'
        );
  check('the caption’s center is a clickable part of the caption', captionHit === caption, true);

  if (caption) {
    await t.click(caption.querySelector('[data-text-from]') ?? caption, 0.99);
    await t.sleep(250);
  }
  check(
    'clicking the caption reveals its complete source',
    t.prose().querySelector('.markdown-list-caption-source')?.textContent ?? null,
    source
  );
  t.key('!');
  await t.sleep(250);
  check(
    'typing edits the caption line, not the first item',
    t.prose().querySelector('.markdown-list-caption-source')?.textContent ?? null,
    ': Steps! {#list:steps .wide owner=demo}'
  );
  t.key('Backspace');
  await t.sleep(250);

  const heading = t.prose().querySelector('h1');
  if (heading) {
    await t.click(heading, 0.5);
    await t.sleep(250);
  }
  check(
    'leaving the caption restores its rendering',
    t.prose().querySelector('.markdown-list-caption')?.textContent?.trim() ?? null,
    'List 1. Steps'
  );

  await t.load('- First\n- Second\n: Direct {#list:direct}\n');
  const direct = t.prose().querySelector('.markdown-list-caption');
  check('a direct caption renders', direct?.textContent?.trim() ?? null, 'List 1. Direct');
  check(
    'the separator changes nothing about the caption spacing',
    direct === null ? null : getComputedStyle(direct).marginTop,
    separatedMargin
  );
  if (direct) {
    await t.click(direct.querySelector('[data-text-from]') ?? direct, 0.99);
    await t.sleep(250);
  }
  check(
    'a direct caption is editable as a line',
    t.prose().querySelector('.markdown-list-caption-source')?.textContent ?? null,
    ': Direct {#list:direct}'
  );

  await t.load('- First\n\n: Separated\n');
  const separated = t.prose().querySelector('.markdown-list-caption');
  if (separated) {
    await t.click(separated.querySelector('[data-text-from]') ?? separated, 0.99);
  }
  for (const _character of ': Separated') {
    t.key('ArrowLeft');
  }
  t.key('Backspace');
  await t.sleep(250);
  check(
    'Backspace at the caption source start removes the source separator',
    await t.raw(),
    '- First\n: Separated\n'
  );

  await t.load('- First\n: Joined\n');
  const joined = t.prose().querySelector('.markdown-list-caption');
  if (joined) {
    await t.click(joined.querySelector('[data-text-from]') ?? joined, 0.99);
  }
  for (const _character of ': Joined') {
    t.key('ArrowLeft');
  }
  t.key('Enter');
  await t.sleep(250);
  check(
    'Enter at the caption source start adds the source separator',
    await t.raw(),
    '- First\n\n: Joined\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
