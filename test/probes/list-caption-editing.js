/**
 * List captions render below their list and edit as their own source line.
 *
 * @covers src/ui/markdown/nodes/caption.ts,
 *   src/ui/markdown/create_block.ts, src/ui/markdown/syntax/list/index.ts
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
  const caption = block?.querySelector('.markdown-caption');
  const separatedMargin = caption == null ? null : getComputedStyle(caption).marginTop;
  check(
    'the list and caption are one block',
    block?.classList.contains('markdown-list-block') ?? false,
    true
  );
  check('the block carries the target ID', block?.id ?? null, 'list:steps');
  check(
    'the caption carries its generated label',
    caption?.querySelector('.markdown-caption-number')?.textContent ?? null,
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
          '.markdown-caption'
        );
  check('the caption’s center is a clickable part of the caption', captionHit === caption, true);

  if (caption) {
    await t.click(caption.querySelector('[data-text-from]') ?? caption, 0.99);
    await t.sleep(250);
  }
  check(
    'clicking the caption reveals its complete source',
    t.prose().querySelector('.markdown-caption-source')?.textContent ?? null,
    source
  );
  t.key('!');
  await t.sleep(250);
  check(
    'typing edits the caption line, not the first item',
    t.prose().querySelector('.markdown-caption-source')?.textContent ?? null,
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
    t.prose().querySelector('.markdown-caption')?.textContent?.trim() ?? null,
    'List 1. Steps'
  );
  const renderedBlock = t.blocks().find((element) => element.textContent.includes('Steps'));
  const renderedCaption = t.prose().querySelector('.markdown-caption');
  const linePoint =
    renderedBlock === undefined || renderedCaption == null
      ? null
      : {
          x: renderedBlock.getBoundingClientRect().right - 4,
          y:
            renderedCaption.getBoundingClientRect().top +
            renderedCaption.getBoundingClientRect().height * 0.5
        };
  const lineTarget =
    linePoint === null ? null : document.elementFromPoint(linePoint.x, linePoint.y);
  if (lineTarget !== null && linePoint !== null) {
    const at = {
      bubbles: true,
      cancelable: true,
      clientX: linePoint.x,
      clientY: linePoint.y
    };
    lineTarget.dispatchEvent(new PointerEvent('pointerdown', at));
    lineTarget.dispatchEvent(new PointerEvent('pointerup', at));
    lineTarget.dispatchEvent(new MouseEvent('click', at));
    await t.sleep(250);
  }
  check(
    'clicking the empty part of the caption line reveals its source',
    t.prose().querySelector('.markdown-caption-source')?.textContent ?? null,
    source
  );
  await t.click(t.prose().querySelector('h1'), 0.5);
  await t.sleep(250);
  const relaidCaption = t.prose().querySelector('.markdown-caption');
  const renderedLabel = relaidCaption?.querySelector('.markdown-caption-number');
  if (renderedLabel) {
    await t.click(renderedLabel, 0.5);
    await t.sleep(250);
  }
  check(
    'clicking the generated label reveals the caption source',
    t.prose().querySelector('.markdown-caption-source')?.textContent ?? null,
    source
  );

  await t.load('- First\n- Second\n: Direct {#list:direct}\n');
  const direct = t.prose().querySelector('.markdown-caption');
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
    t.prose().querySelector('.markdown-caption-source')?.textContent ?? null,
    ': Direct {#list:direct}'
  );

  await t.load('- First\n\n: Separated\n');
  const separated = t.prose().querySelector('.markdown-caption');
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
  const joined = t.prose().querySelector('.markdown-caption');
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
