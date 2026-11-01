/**
 * Enter preserves quote depth and block context.
 *
 * @covers src/ui/markdown/syntax/container/quote/,
 *   src/ui/markdown/editing/text/index.ts
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
  const clickTextEnd = async (selector, needle) => {
    const source = t.prose().querySelector(selector);
    if (source === null) {
      return false;
    }
    const node = [...t.textNodesIn(source)]
      .reverse()
      .find((candidate) => candidate.data.includes(needle));
    const at = node?.data.lastIndexOf(needle);
    if (!node || at < 0) {
      return false;
    }
    const range = document.createRange();
    const end = at + needle.length;
    range.setStart(node, end - 1);
    range.setEnd(node, end);
    const box = range.getBoundingClientRect();
    const event = {
      bubbles: true,
      cancelable: true,
      clientX: box.right - 0.5,
      clientY: box.top + box.height / 2
    };
    const target = node.parentElement;
    target.dispatchEvent(new PointerEvent('pointerdown', event));
    target.dispatchEvent(new PointerEvent('pointerup', event));
    target.dispatchEvent(new MouseEvent('click', event));
    await t.sleep(50);
    return true;
  };
  const clickBoundary = async (element, side) => {
    const text = t.textNodesIn(element).find((node) => node.data.length > 0);
    if (!text) {
      return false;
    }
    const range = document.createRange();
    const at = side === 'end' ? text.data.length - 1 : 0;
    range.setStart(text, at);
    range.setEnd(text, at + 1);
    const box = range.getBoundingClientRect();
    const event = {
      bubbles: true,
      cancelable: true,
      clientX: side === 'end' ? box.right - 0.5 : box.left + 0.5,
      clientY: box.top + box.height / 2
    };
    const target = text.parentElement;
    target.dispatchEvent(new PointerEvent('pointerdown', event));
    target.dispatchEvent(new PointerEvent('pointerup', event));
    target.dispatchEvent(new MouseEvent('click', event));
    await t.sleep(50);
    return true;
  };

  await t.load('> A line\n');
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  t.key('Enter');
  await t.sleep(80);
  check('paragraph Enter', await t.raw(), '> A line\n>\n>\n');

  await t.load('> A line\n');
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  t.key('Enter');
  await t.sleep(50);
  t.key('Enter');
  await t.sleep(80);
  check('second Enter leaves the quote', await t.raw(), '> A line\n\n\n');

  await t.load('> > A line\n');
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  t.key('Enter');
  await t.sleep(50);
  t.key('Enter');
  await t.sleep(80);
  check('nested exit pops one level', await t.raw(), '> > A line\n>\n>\n');

  await t.load('> > A line\n');
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  t.key('Enter');
  await t.sleep(50);
  t.key('Enter');
  await t.sleep(50);
  t.key('Enter');
  await t.sleep(80);
  check('another Enter pops the outer level', await t.raw(), '> > A line\n\n\n');

  await t.load('> > $$\n> > x\n> > $$\n');
  await t.click(t.prose().querySelectorAll('blockquote blockquote')[0], 0.99);
  await t.sleep(80);
  await clickTextEnd('.markdown-quote-source', '$$');
  t.key('Enter');
  await t.sleep(80);
  check(
    'after a closed equation a full quoted paragraph break is added',
    await t.raw(),
    '> > $$\n> > x\n> > $$\n> >\n> >\n'
  );

  await t.load('> > - First\n');
  await t.click(t.prose().querySelector('li'), 0.99);
  t.key('Enter');
  await t.sleep(80);
  check(
    'a quoted list continues with its full prefix',
    await t.raw(),
    '> > - First\n> > - \n'
  );

  await t.load('> ```js\n> const value = 1;\n> ```\n');
  await t.click(t.prose().querySelector('pre'), 0.99);
  await t.sleep(80);
  await clickTextEnd('.markdown-source-text', String.fromCharCode(96).repeat(3));
  t.key('Enter');
  await t.sleep(80);
  check(
    'Enter after a closed code block adds a full quoted paragraph break',
    await t.raw(),
    '> ```js\n> const value = 1;\n> ```\n>\n>\n'
  );

  await t.load('Before\n\n> [!NOTE]\n\nAfter\n');
  const beforeEmpty = [...t.prose().querySelectorAll('p')].find(
    (node) => node.textContent === 'Before'
  );
  await clickBoundary(beforeEmpty, 'end');
  t.key('ArrowRight');
  await t.sleep(80);
  t.key('N');
  await t.sleep(80);
  check(
    'typing into an empty GitHub callout creates its body line',
    await t.raw(),
    'Before\n\n> [!NOTE]\n> N\n\nAfter\n'
  );

  await t.load('> | A | B |\n> | --- | --- |\n> | 1 | 2 |\n');
  const headerCell = t.prose().querySelector('[data-table-cell="0:1"]');
  await t.click(headerCell);
  const tableSource = t.prose().querySelector('.markdown-quote-source')?.textContent ?? null;
  const beforeCaret = t.caretRect();
  t.key('Enter');
  await t.sleep(80);
  const afterCaret = t.caretRect();
  const afterSource = t.prose().querySelector('.markdown-quote-source')?.textContent ?? null;
  check(
    'Enter moves down a source-visible quoted table without editing it',
    afterSource === tableSource &&
      beforeCaret !== null &&
      afterCaret !== null &&
      afterCaret.y > beforeCaret.y,
    true
  );
  t.key('Enter');
  await t.sleep(80);
  check(
    'Enter at a quoted table end adds one quoted separator',
    await t.raw(),
    '> | A | B |\n> | --- | --- |\n> | 1 | 2 |\n>\n'
  );

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
