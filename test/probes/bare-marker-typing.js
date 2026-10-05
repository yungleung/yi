/**
 * A bare list marker is text: typing `-` on a line of its own leaves the character there,
 * and the item begins at the space that follows it (`- `) — which is also when the bullet
 * appears and the line can be typed into. A bare marker under a paragraph line leaves that
 * paragraph alone instead of folding it into a setext heading.
 *
 * @covers src/ui/markdown/syntax/bare_markers.ts, src/ui/markdown/syntax/markers.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });

  const first = (index = 0) => t.blocks()[index]?.firstElementChild ?? null;
  const type = async (keys) => {
    for (const key of keys) {
      t.key(key);
      await t.sleep(60);
    }
    await t.sleep(250);
  };
  const emptyFirstLine = async () => {
    await t.load('hello world\n');
    await t.click(t.blocks()[0], 0.5, 0.5);
    await t.sleep(120);
    for (let step = 0; step < 40; step += 1) {
      t.key('ArrowLeft');
    }
    await t.sleep(150);
    t.key('Enter');
    await t.sleep(250);
  };

  // The marker alone is the character, not an item.
  await emptyFirstLine();
  await type(['-']);
  check('a typed `-` stays the character', await t.raw(), '-\n\nhello world\n');
  check('and the line is a paragraph', first()?.tagName ?? null, 'P');
  check('showing the marker itself', first()?.textContent ?? null, '-');
  check('with no list under it', t.blocks()[0]?.querySelector('li') ?? null, null);

  // The space is what makes the item — and the line can be typed into from there.
  await type([' ']);
  check('the space makes the item', await t.raw(), '- \n\nhello world\n');
  check('and the bullet is there', first()?.tagName ?? null, 'UL');
  await type(['x']);
  check('which the next character goes into', await t.raw(), '- x\n\nhello world\n');

  // A marker under a paragraph line is text too: the paragraph above it keeps its own line.
  await t.load('foo\n-\n');
  await t.sleep(300);
  check('a bare marker under a paragraph does not fold it into a heading', (() => {
    const block = t.blocks()[0];
    return {
      headings: block.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
      lists: block.querySelectorAll('li').length,
      paragraphs: [...block.querySelectorAll('p')].map((paragraph) => paragraph.textContent)
    };
  })(), { headings: 0, lists: 0, paragraphs: ['foo', '-'] });

  // And a marker with its space is still an empty item there.
  await t.load('foo\n- \n');
  await t.sleep(300);
  check('a marker with its space is an empty item under a paragraph', (() => {
    const block = t.blocks()[0];
    return {
      headings: block.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
      lists: block.querySelectorAll('li').length,
      paragraphs: [...block.querySelectorAll('p')].map((paragraph) => paragraph.textContent)
    };
  })(), { headings: 0, lists: 1, paragraphs: ['foo'] });

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
