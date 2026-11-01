/**
 * Ordinary quotes reveal their complete source and edit physical lines exactly:
 * blank carriers delete whole, `>` never invents a space, and escaped prose
 * splits at the visible character.
 *
 * @covers src/ui/markdown/source_mode/,
 *   src/ui/markdown/editing/text/index.ts,
 *   src/ui/markdown/syntax/container/quote/
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
  const clickOffset = async (source, offset, edge = 0.5) => {
    if (source === null) {
      return false;
    }
    const text = t.textNodesIn(source).find((node) => node.data.length > 0);
    if (!text) {
      return false;
    }
    const at = Math.max(0, Math.min(offset, text.data.length - 1));
    const range = document.createRange();
    range.setStart(text, at);
    range.setEnd(text, at + 1);
    const box = range.getBoundingClientRect();
    const event = {
      bubbles: true,
      cancelable: true,
      clientX: box.left + box.width * edge,
      clientY: box.top + box.height / 2
    };
    source.dispatchEvent(new PointerEvent('pointerdown', event));
    source.dispatchEvent(new PointerEvent('pointerup', event));
    source.dispatchEvent(new MouseEvent('click', event));
    await t.sleep(150);
    return true;
  };

  await t.load('> A [link](https://example.com)\n');
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  await t.sleep(150);
  check(
    'an ordinary quote reveals its complete source',
    t.prose().querySelector('.markdown-quote-source')?.textContent ?? null,
    '> A [link](https://example.com)'
  );

  await t.load('> A\n>');
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  await t.sleep(150);
  const unspaced = t.prose().querySelector('.markdown-quote-source');
  check('the unspaced blank quote exposes source', unspaced !== null, true);
  await clickOffset(unspaced, 4, 0.99);
  t.key('B');
  await t.sleep(200);
  check('typing on `>` does not invent a visible space', await t.raw(), '> A\n>B');

  await t.load('> A\n>\n> B\n');
  await t.click(t.prose().querySelector('blockquote'), 0.5);
  await t.sleep(150);
  const blank = t.prose().querySelector('.markdown-quote-source');
  check('the spaced blank quote exposes source', blank !== null, true);
  await clickOffset(blank, 4, 0.99);
  t.key('Backspace');
  await t.sleep(200);
  check(
    'Backspace on a blank quoted line removes the complete physical line',
    await t.raw(),
    '> A\n> B\n'
  );

  await t.load('> \\[!NOTE]\n> This is literal quoted text.\n');
  await t.click(t.prose().querySelector('blockquote'), 0.5);
  await t.sleep(150);
  const escaped = t.prose().querySelector('.markdown-quote-source');
  check('the escaped quote exposes source', escaped !== null, true);
  const escapedText = escaped ? t.textNodesIn(escaped)[0] : null;
  const quotedAt = escapedText?.data.indexOf('quoted') ?? -1;
  await clickOffset(escaped, quotedAt, 0.01);
  t.key('Enter');
  await t.sleep(200);
  check(
    'Enter in escaped quoted prose splits at the visible character',
    await t.raw(),
    '> \\[!NOTE]\n> This is literal \n>\n> quoted text.\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
