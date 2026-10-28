/**
 * Enter in a quoted list keeps list semantics and quote carriers.
 *
 * @covers src/ui/markdown/editing/text_commands.ts,
 *   src/ui/markdown/syntax/quote_edits.ts
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
  const clickTextEnd = async (needle) => {
    const node = [...t.textNodesIn(t.prose())]
      .find((candidate) => candidate.data.includes(needle));
    const at = node?.data.lastIndexOf(needle);
    if (!node || at < 0) return false;
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
    await t.sleep(120);
    return true;
  };

  await t.load('> - Parent\n>   - Child\n');
  await clickTextEnd('Parent');
  t.key('Enter');
  await t.sleep(120);
  check(
    'a quoted parent inserts its next sibling after nested children',
    await t.raw(),
    '> - Parent\n>   - Child\n> - \n'
  );

  await t.load('> - \n');
  await clickTextEnd('-');
  t.key('Enter');
  await t.sleep(120);
  check(
    'Enter on an empty quoted item leaves the list inside the quote',
    await t.raw(),
    '> \n'
  );

  await t.load('> - Parent\n');
  await clickTextEnd('Parent');
  t.key('Enter');
  await t.sleep(120);
  t.key('Enter');
  await t.sleep(120);
  check(
    'a second Enter on the new blank item leaves a plain quoted line',
    await t.raw(),
    '> - Parent\n> \n'
  );

  await t.load('> [!NOTE]\n> - Parent\n');
  await clickTextEnd('Parent');
  t.key('Enter');
  await t.sleep(120);
  t.key('Enter');
  await t.sleep(120);
  check(
    'the same empty-item exit leaves a plain callout body line',
    await t.raw(),
    '> [!NOTE]\n> - Parent\n> \n'
  );

  await t.load('Before\n\n> - \n');
  await clickTextEnd('-');
  t.key('Enter');
  await t.sleep(120);
  check(
    'a quote after earlier text exits its blank item without touching the prefix',
    await t.raw(),
    'Before\n\n> \n'
  );

  await t.load('Before\n\n> [!NOTE]\n> - \n');
  await clickTextEnd('-');
  t.key('Enter');
  await t.sleep(120);
  check(
    'a callout after earlier text exits its blank item without touching the prefix',
    await t.raw(),
    'Before\n\n> [!NOTE]\n> \n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
