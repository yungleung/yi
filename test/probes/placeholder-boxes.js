/**
 * An empty line is a box, not a space.
 *
 * A blank paragraph, an empty list item, an empty table cell and an empty fenced body all hold an
 * *empty* text node: the space they used to hold was a character the reader could select, copy or
 * click past, and the document never had it. What gives each of them a line is the block's own box
 * (`styles.css`), and what gives the caret a place is the line box the geometry falls back to
 * (`caret/geometry.ts: lineBoxAround`) — the same box a click on the line already used.
 *
 * An empty *item* also needs a line for the marker a list draws outside its content box: without
 * one, WebKit paints the block the editor just replaced and leaves the marker unpainted until the
 * next repaint — the bullet the reader has just made is missing until they type again. The line
 * comes from a *generated* mark in the placeholder (`styles.css`), so it is not a character of the
 * document; a bridge screenshot re-renders the page and cannot show this, so what is held here is
 * the shape that keeps the marker painted.
 *
 * @covers src/ui/markdown/caret/geometry.ts, src/ui/markdown/create_block.ts,
 *   src/ui/markdown/nodes/list.ts, src/ui/markdown/nodes/table.ts, src/ui/markdown/nodes/fence/text.ts
 *   and src/styles.css: the empty item's line
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });

  /** Whether the drawn caret sits on this line, within a couple of pixels of its left edge. */
  const caretOnLine = (element, left = 0) => {
    const caret = t.caretRect();
    const box = element.getBoundingClientRect();
    if (caret === null) return null;
    return (
      Math.abs(caret.y - box.top) <= 12 &&
      caret.x >= box.left + left - 2 &&
      caret.x <= box.left + left + 24
    );
  };
  /** The height of the drawn caret, in pixels. */
  const caretHeight = () => {
    const element = document.querySelector('.markdown-caret');
    return element === null ? null : Math.round(element.getBoundingClientRect().height);
  };

  // 1. The blank line of a paragraph: the paragraph's own height is the line's.
  await t.load('alpha\n\n\n\nbeta\n');
  await t.sleep(250);
  const blank = [...t.prose().querySelectorAll('.markdown-block')].find((b) =>
    b.classList.contains('markdown-blank')
  );
  // A caret in text is the yardstick the blank line's caret has to match: a caret is as tall as the
  // *type*, not as tall as the line the block draws (a blank line's box is the paragraph's own
  // `min-height`).
  await t.click(t.prose().querySelectorAll('p')[0], 0.3, 0.5);
  await t.sleep(250);
  const textHeight = caretHeight();
  check('a blank line holds no character', blank.querySelector('.markdown-empty-line-placeholder').textContent, '');
  check('and its paragraph still has a line', Math.round(blank.querySelector('p').getBoundingClientRect().height), 24);
  await t.click(blank.querySelector('p'), 0.05, 0.5);
  await t.sleep(250);
  check('a click on it draws the caret on that line', caretOnLine(blank.querySelector('p')), true);
  check('and the bar is the height of a caret in text', caretHeight(), textHeight);
  t.key('x');
  await t.sleep(250);
  check('and typing lands on it', await t.raw(), 'alpha\n\nx\n\n\nbeta\n');

  // 2. An empty fenced body: the body's own node is empty, and its line is one line of code.
  await t.load('text\n\n```ts\n```\n\ntail\n');
  await t.sleep(250);
  const pre = t.prose().querySelector('.markdown-fenced-code');
  check('an empty code block is one line tall, like a filled one', Math.round(pre.getBoundingClientRect().height), 48);
  await t.click(pre, 0.2, 0.5);
  await t.sleep(300);
  // The click enters the block, which is then built as its own text: the element that answers is
  // the one at the same line, so the check asks the block as it is now — and for the *body's* own
  // line, the line between the two delimiters.
  const body = t.prose().querySelector('.markdown-block[data-line-start="3"] .markdown-source-text code');
  check('a click in it draws the caret on the body line', caretOnLine(body), true);
  t.key('Q');
  await t.sleep(300);
  check('and typing lands in the body', await t.raw(), 'text\n\n```ts\nQ\n```\n\ntail\n');

  // 3. An empty list item.
  await t.load('alpha\n\n- \n\ntail\n');
  await t.sleep(250);
  const item = t.prose().querySelector('li');
  const itemPlaceholder = item.querySelector('.markdown-list-placeholder');
  check('an empty item holds no character', itemPlaceholder.textContent, '');
  check('and the item still has a line', Math.round(item.getBoundingClientRect().height), 24);
  // The marker a list draws sits *outside* the item's content box, and the engine only paints it
  // with a line the item has of its own: the placeholder's box takes one from a generated mark,
  // which the reader cannot select or copy — the document is exactly what the author wrote.
  check(
    'and the placeholder is a line the engine can draw the marker with',
    {
      box: Math.round(itemPlaceholder.getBoundingClientRect().height),
      generated: getComputedStyle(itemPlaceholder, '::before').content !== 'none'
    },
    { box: 24, generated: true }
  );
  check('adding no character to the document', await t.raw(), 'alpha\n\n- \n\ntail\n');
  await t.click(item, 0.9, 0.5);
  await t.sleep(250);
  check('a click on it draws the caret in the item', caretOnLine(item, 6), true);
  t.key('L');
  await t.sleep(300);
  check('and typing lands in the item', await t.raw(), 'alpha\n\n- L\n\ntail\n');

  // 4. An empty table cell.
  await t.load('| a | b |\n| --- | --- |\n| x |  |\n');
  await t.sleep(250);
  const cell = [...t.prose().querySelectorAll('td')].pop();
  check('an empty cell holds no character', cell.querySelector('.markdown-table-placeholder').textContent, '');
  await t.click(cell, 0.5, 0.5);
  await t.sleep(250);
  check('a click on it draws the caret in the cell', caretOnLine(cell, 10), true);

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
