/**
 * Follow-up behavior for callout bodies and opening markers on ordinary blank lines.
 *
 * @covers src/ui/markdown/editing/text/index.ts,
 *   src/ui/markdown/syntax/container/quote/,
 *   src/ui/markdown/nodes/callout.ts
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
  const type = async (keys, delay = 40) => {
    for (const key of keys) {
      t.key(key);
      await t.sleep(delay);
    }
    await t.sleep(180);
  };
  const clickEnd = async (element, needle) => {
    const node = element === null
      ? null
      : [...t.textNodesIn(element)].reverse().find((candidate) => candidate.data.includes(needle));
    const at = node?.data.lastIndexOf(needle);
    if (!node || at < 0) return false;
    const range = document.createRange();
    const end = at + needle.length;
    range.setStart(node, end);
    range.collapse(true);
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
    await t.sleep(120);
    return true;
  };
  const openCalloutSource = async () => {
    await t.click(t.prose().querySelector('.markdown-callout-title'));
    await t.sleep(150);
    return t.prose().querySelector('.markdown-callout-source');
  };
  await t.load('Before\n\n> [!NOTE]\n\nAfter\n');
  const source = await openCalloutSource();
  await clickEnd(source, '> [!NOTE]');
  t.key('Enter');
  await t.sleep(180);
  check(
    'Enter at a GitHub callout marker creates two quoted blank lines',
    await t.raw(),
    'Before\n\n> [!NOTE]\n>\n>\n\nAfter\n'
  );

  await t.load('Before\n\n> [!NOTE]\n\nAfter\n');
  const exitSource = await openCalloutSource();
  await clickEnd(exitSource, '> [!NOTE]');
  t.key('Enter');
  await t.sleep(100);
  t.key('Enter');
  await t.sleep(180);
  check(
    'a second Enter leaves the empty GitHub callout',
    await t.raw(),
    'Before\n\n> [!NOTE]\n\n\n\nAfter\n'
  );

  await t.load('Before\n\n> [!NOTE]\n\nAfter\n');
  const sourceAgain = await openCalloutSource();
  await clickEnd(sourceAgain, '> [!NOTE]');
  t.key('Enter');
  await t.sleep(180);
  const after = [...t.prose().querySelectorAll('p')].find(
    (paragraph) => paragraph.textContent === 'After'
  );
  await t.click(after);
  await t.sleep(180);
  const blank = t.prose().querySelector('.markdown-callout-empty');
  check('the rendered callout still has an empty body line', blank !== null, true);
  if (blank) {
    await t.click(blank);
    await t.sleep(180);
  }
  check(
    'clicking that visual blank line reveals the complete callout source',
    t.prose().querySelector('.markdown-callout-source') !== null,
    true
  );

  const pickerBody = Array.from({ length: 12 }, (_, index) => `> Line ${index}`).join('\n');
  await t.load(`Before\n\n> [!NOTE]\n${pickerBody}\n> \n\nAfter\n`);
  const pickerSource = await openCalloutSource();
  await clickEnd(pickerSource, '> ');
  await type([':', ':', ':', ' ']);
  const pickerCard = document
    .querySelector('[data-div-kind-choice]')
    ?.parentElement?.parentElement ?? null;
  const caretBox = (await t.app('/src/ui/markdown/caret/caret.ts'))
    .getCaretRange()
    ?.getBoundingClientRect() ?? null;
  const cardBox = pickerCard?.getBoundingClientRect() ?? null;
  const pickerBesideCaret =
    caretBox !== null &&
    cardBox !== null &&
    Math.abs(cardBox.left - caretBox.left) < 320 &&
    (Math.abs(cardBox.bottom - caretBox.top) < 24 ||
      Math.abs(cardBox.top - caretBox.bottom) < 24);
  check(
    'the callout picker opens beside the caret inside a callout',
    pickerBesideCaret,
    true
  );
  t.key('Escape');
  await t.sleep(100);

  await t.load(
    'Before\n\n> [!NOTE]\n> - First\n> - Second\n>\n> $$\n> x = 1\n> $$\n\nAfter\n'
  );
  const rich = await openCalloutSource();
  await clickEnd(rich, '> $$');
  t.key('Enter');
  await t.sleep(180);
  check(
    'Enter after a quoted block closes with two quoted blank lines',
    await t.raw(),
    'Before\n\n> [!NOTE]\n> - First\n> - Second\n>\n> $$\n> x = 1\n> $$\n>\n>\n\nAfter\n'
  );

  await t.load(
    'Before\n\n> [!NOTE]\n> - First\n> - Second\n>\n> $$\n> x = 1\n> $$\n\nAfter\n'
  );
  const richExit = await openCalloutSource();
  await clickEnd(richExit, '> $$');
  t.key('Enter');
  await t.sleep(100);
  t.key('Enter');
  await t.sleep(180);
  check(
    'a second Enter removes the two markers after a completed child',
    await t.raw(),
    'Before\n\n> [!NOTE]\n> - First\n> - Second\n>\n> $$\n> x = 1\n> $$\n\n\n\nAfter\n'
  );

  for (const [name, keys, expected] of [
    ['display math', ['$', '$'], 'Before\n\n$$\n\n$$\n\nAfter\n'],
    ['code fence', ['`', '`', '`'], 'Before\n\n```\n\n```\n\nAfter\n'],
    [
      'default fenced Div',
      [':', ':', ':', ' '],
      'Before\n\n:::\n\n:::\n\nAfter\n'
    ]
  ]) {
    await t.load('Before\n\n\nAfter\n');
    await t.click(t.prose().querySelector('.markdown-empty-line'));
    await type(keys);
    if (name === 'code fence') {
      check(
        'the code-fence language picker opens on an ordinary blank line',
        document.querySelectorAll('[data-language]').length > 100,
        true
      );
      t.key('Escape');
    }
    if (name === 'default fenced Div') {
      check(
        'the Div-kind picker opens on an ordinary blank line',
        document.querySelectorAll('[data-div-kind-choice]').length,
        19
      );
    }
    const raw = await t.raw();
    check(
      `${name} opens on an ordinary blank line`,
      raw.startsWith(expected) ? true : raw,
      true
    );
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
