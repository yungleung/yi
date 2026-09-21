/**
 * Tab inside a display formula's own text types two spaces, like fenced code —
 * and the caret stays where the edit left it, so the next keystroke lands
 * after them rather than somewhere the text round-trip dropped it.
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const doc = 'text\n\n$$\n\\frac{a}{b}\n$$\n';
  await t.load(doc);
  await t.click(t.prose().querySelector('[data-display="true"]'), 0.5, 0.5);
  const source = () => t.prose().querySelector('.markdown-source-text');
  check('the formula shows its own text', source()?.textContent ?? null, '$$\n\\frac{a}{b}\n$$');
  // The caret belongs at the end of the formula's own line, which is where the
  // click entered it (the rendering cannot name a character).
  const positionAt = (root, offset) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let acc = 0;
    let node;
    while ((node = walker.nextNode())) {
      if (offset <= acc + node.data.length) {
        return { node, offset: offset - acc };
      }
      acc += node.data.length;
    }
    return null;
  };
  const lineEnd = (() => {
    const text = source().textContent;
    const position = positionAt(source(), text.indexOf('\n$$'));
    if (!position) {
      return null;
    }
    const range = document.createRange();
    range.setStart(position.node, position.offset);
    range.collapse(true);
    return range.getBoundingClientRect();
  })();
  const caret = t.caretRect();
  checks.push({
    name: 'and the caret sits at the end of the content line',
    actual: caret && lineEnd ? { x: Math.round(caret.x - lineEnd.left), y: Math.round(caret.y - lineEnd.top) } : null,
    expected: { x: 0, y: 0 },
    pass: Boolean(caret && lineEnd && Math.abs(caret.x - lineEnd.left) <= 2 && Math.abs(caret.y - lineEnd.top) <= 2)
  });

  // Tab where the author is: two spaces at the caret, and the caret after them.
  t.key('Tab');
  await t.sleep(300);
  check('Tab types two spaces at the caret', await t.raw(), 'text\n\n$$\n\\frac{a}{b}  \n$$\n');
  t.key('X');
  await t.sleep(300);
  check('and the next keystroke lands after them', await t.raw(), 'text\n\n$$\n\\frac{a}{b}  X\n$$\n');

  // Tab on the closing fence's own line does nothing: two spaces in front of a
  // fence are no longer a fence.
  const fenceY = t.rectOf(source()).top + source().getBoundingClientRect().height - 12;
  source().dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: Math.round(source().getBoundingClientRect().left + 2),
      clientY: Math.round(fenceY)
    })
  );
  await t.sleep(250);
  t.key('Tab');
  await t.sleep(300);
  check('a `$$` line is never indented', await t.raw(), 'text\n\n$$\n\\frac{a}{b}  X\n$$\n');
  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
