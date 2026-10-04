/**
 * Every fenced block says what it is, in its own top-right corner.
 *
 * The delimiters are not drawn (`nodes/fence_body.ts`), so nothing in the body says whether it is
 * frontmatter and of which format, a fenced code block and in which language, or a formula. The
 * label says it; a fenced code block's is a *button*, because the language is the one thing about
 * that block the reader may want to change, and what it opens is highlight.js's own list.
 *
 * The label is chrome, not text: it hangs over the block's box (nothing is measured again for it),
 * and the offsets step over it (`data-chrome`) — which this probe watches from the reader's side by
 * typing in a block that has one.
 *
 * @covers src/ui/markdown/nodes/fence_label.ts, src/ui/markdown/editing/language_picker.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const label = (index) => t.blocks()[index]?.querySelector('.markdown-fence-label') ?? null;
  const press = (element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  const doc = '---\nid: 1\n---\n\n```js\nconst a = 1;\n```\n\n$$\n\\frac{a}{b}\n$$\n';
  await t.load(doc);
  await t.sleep(300);

  check('a frontmatter block says what it is', label(0)?.textContent ?? null, 'YAML Frontmatter');
  check('a fenced code block says its language', label(1)?.textContent ?? null, 'js');
  check('and that label is a button', label(1)?.tagName ?? null, 'BUTTON');
  check('a formula says nothing while it renders', label(2), null);

  // It hangs in the block's corner and takes no room: the block is as tall as its body.
  const block = t.blocks()[1];
  const blockBox = block.getBoundingClientRect();
  const labelBox = label(1).getBoundingClientRect();
  check(
    'the label sits in the block’s top-right corner',
    labelBox.top - blockBox.top < 24 && blockBox.right - labelBox.right < 24,
    true
  );
  check(
    'and the label is inside the block’s own box, not above it',
    labelBox.top >= blockBox.top - 1 && labelBox.bottom <= blockBox.bottom + 1,
    true
  );

  // Typing in the block is unaffected by the label's own text (the offsets step over it).
  const body = block.querySelector('pre');
  await t.click(t.textNodesIn(body).pop().parentElement, 0.99);
  await t.sleep(200);
  t.key('X');
  await t.sleep(300);
  check(
    'typing in the block still lands in its body',
    await t.raw(),
    '---\nid: 1\n---\n\n```js\nconst a = 1;X\n```\n\n$$\n\\frac{a}{b}\n$$\n'
  );

  // Pressing the label opens the languages, and a pick rewrites the opening fence and nothing else.
  await t.load(doc);
  await t.sleep(300);
  press(label(1));
  await t.sleep(300);
  const rows = [...document.querySelectorAll('[data-language]')];
  check('pressing it opens the languages highlight.js supports', rows.length > 100, true);
  // `js` is an alias: the list is highlight.js's own registered names.
  check(
    'with the language the fence names among them',
    rows.some((row) => row.dataset.language === 'javascript'),
    true
  );
  rows.find((row) => row.dataset.language === 'python')?.click();
  await t.sleep(350);
  check(
    'and the fence takes the language, the body untouched',
    await t.raw(),
    '---\nid: 1\n---\n\n```python\nconst a = 1;\n```\n\n$$\n\\frac{a}{b}\n$$\n'
  );
  check('with the label saying so', label(1)?.textContent ?? null, 'python');
  // The card is the app's own chrome, reused: it is hidden rather than emptied.
  check('and the list is no longer shown', rows[0].closest('.hidden') !== null, true);

  // A formula's label appears when its own text is what the block shows.
  await t.click(t.prose().querySelector('[data-display="true"]'), 0.5, 0.5);
  await t.sleep(350);
  check('a formula’s source says latex', label(2)?.textContent ?? null, 'latex');

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
