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
  check('the formula shows its own text', source()?.textContent ?? null, '\\frac{a}{b}\n');
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
    // The delimiters are not drawn: the last content line's end is the body's, less its newline.
    const position = positionAt(source(), text.trimEnd().length);
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

  // Tab on a delimiter's own line is not measured here any more: the delimiters are not drawn, so
  // the caret cannot be put on one by a click. The rule that skips them — two spaces in front of a
  // fence are no longer a fence — is the pure one in `test/checks/check-code-edits.mjs`, which
  // holds it for a caret there and for a selection that spans them.
  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
