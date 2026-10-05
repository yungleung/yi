/** Clicking a character in a display formula's source puts the caret on it. */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const doc = 'text\n\n$$\n\\frac{a}{b} + c\n$$\n\ntail\n';
  await t.load(doc);
  await t.click(t.prose().querySelector('[data-display="true"]'), 0.5, 0.5);
  const source = t.prose().querySelector('.markdown-source-text');
  check('the block shows its own text', source?.textContent ?? null, '$$\n\\frac{a}{b} + c\n$$');
  if (!source) {
    return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
  }

  // Click the near edge of the `c`: the caret belongs between `+ ` and `c`.
  const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
  let text = null;
  let at = -1;
  let node;
  while ((node = walker.nextNode())) {
    const found = node.data.indexOf('+ c');
    if (found >= 0) {
      text = node;
      at = found + 2;
      break;
    }
  }
  const target = document.createRange();
  target.setStart(text, at);
  target.setEnd(text, at + 1);
  const rect = target.getBoundingClientRect();
  source.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: Math.round(rect.left + rect.width * 0.25),
      clientY: Math.round(rect.top + rect.height / 2)
    })
  );
  await t.sleep(250);
  const caret = t.caretRect();
  check(
    'the caret lands on the character clicked',
    caret ? Math.abs(caret.x - rect.left) <= 6 : null,
    true
  );
  t.key('Z');
  await t.sleep(300);
  check('and typing goes there', await t.raw(), 'text\n\n$$\n\\frac{a}{b} + Zc\n$$\n\ntail\n');
  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
