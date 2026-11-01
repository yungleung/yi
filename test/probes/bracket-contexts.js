/**
 * Opening brackets pair in every editable text context, through both ordinary
 * keys and native input-method commits.
 *
 * @covers src/ui/markdown/editing/text/index.ts,
 *   src/ui/markdown/syntax/brackets.ts
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
      clientX: box.left + 1,
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
    await t.sleep(120);
    return t.prose().querySelector('.markdown-callout-source');
  };
  const commit = async (text) => {
    const seam = document.querySelector('.markdown-composition-input');
    seam.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    seam.value = text;
    seam.dispatchEvent(new CompositionEvent('compositionend', { data: text, bubbles: true }));
    await t.sleep(180);
  };

  await t.load('Body\n');
  await t.click(t.blocks()[0], 0.99);
  t.key('[');
  await t.sleep(120);
  check('ordinary text pairs an opening bracket', await t.raw(), 'Body[]\n');

  await t.load('Body\n');
  await t.click(t.blocks()[0], 0.99);
  t.key('(');
  await t.sleep(120);
  check('ordinary text pairs a parenthesis', await t.raw(), 'Body()\n');

  await t.load('Body\n');
  await t.click(t.blocks()[0], 0.99);
  t.key('{');
  await t.sleep(120);
  check('ordinary text pairs a brace', await t.raw(), 'Body{}\n');

  await t.load('> Body\n');
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  await clickEnd(t.prose().querySelector('.markdown-quote-source'), 'Body');
  t.key('[');
  await t.sleep(120);
  check('an ordinary quote pairs an opening bracket', await t.raw(), '> Body[]\n');

  await t.load('::: {.callout .callout-note}\nBody\n:::\n');
  const div = await openCalloutSource();
  await clickEnd(div, 'Body');
  t.key('[');
  await t.sleep(120);
  check(
    'a fenced-Div callout pairs an opening bracket',
    await t.raw(),
    '::: {.callout .callout-note}\nBody[]\n:::\n'
  );

  await t.load('> [!NOTE]\n> Body\n');
  const alert = await openCalloutSource();
  await clickEnd(alert, 'Body');
  t.key('[');
  await t.sleep(120);
  check('a GitHub callout pairs an opening bracket', await t.raw(), '> [!NOTE]\n> Body[]\n');

  await t.load('Body\n');
  await t.click(t.blocks()[0], 0.99);
  await commit('[');
  check('a committed opening bracket pairs in ordinary text', await t.raw(), 'Body[]\n');

  await t.load('Body\n');
  await t.click(t.blocks()[0], 0.99);
  await commit('(');
  check('a committed parenthesis pairs in ordinary text', await t.raw(), 'Body()\n');

  await t.load('\n');
  await t.click(t.prose().querySelector('.markdown-empty-line'));
  t.key('[');
  await t.sleep(120);
  check('an ordinary blank line pairs an opening bracket', await t.raw(), '[]\n');
  t.key('x');
  await t.sleep(120);
  check('and leaves the caret inside that pair', await t.raw(), '[x]\n');

  await t.load('> Body\n');
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  await clickEnd(t.prose().querySelector('.markdown-quote-source'), 'Body');
  await commit('[');
  check('a committed opening bracket pairs in a quote', await t.raw(), '> Body[]\n');

  await t.load('::: {.callout .callout-note}\nBody\n:::\n');
  const committedDiv = await openCalloutSource();
  await clickEnd(committedDiv, 'Body');
  await commit('[');
  check(
    'a committed opening bracket pairs in a fenced-Div callout',
    await t.raw(),
    '::: {.callout .callout-note}\nBody[]\n:::\n'
  );

  await t.load('> [!NOTE]\n> Body\n');
  const committedAlert = await openCalloutSource();
  await clickEnd(committedAlert, 'Body');
  await commit('[');
  check(
    'a committed opening bracket pairs in a GitHub callout',
    await t.raw(),
    '> [!NOTE]\n> Body[]\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
