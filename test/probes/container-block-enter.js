/**
 * Quoted and called-out fenced blocks accept repeated blank lines, while a
 * fenced-Div callout nested in another callout still uses its own one-line
 * Enter rule.
 *
 * @covers src/ui/markdown/editing/text_commands.ts,
 *   src/ui/markdown/syntax/container/
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
    const root = t.prose().querySelector(selector);
    if (root === null) return false;
    const node = [...t.textNodesIn(root)]
      .reverse()
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

  await t.load('> ```js\n> const value = 1;\n> ```\n');
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  await clickTextEnd('.markdown-quote-source', 'const value = 1;');
  t.key('Enter');
  await t.sleep(80);
  t.key('Enter');
  await t.sleep(80);
  t.key('Z');
  await t.sleep(180);
  check(
    'a quoted code body accepts repeated blank lines',
    await t.raw(),
    '> ```js\n> const value = 1;\n> \n> Z\n> ```\n'
  );

  await t.load('> $$\n> x = 1\n> $$\n');
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  await clickTextEnd('.markdown-quote-source', 'x = 1');
  t.key('Enter');
  await t.sleep(80);
  t.key('Enter');
  await t.sleep(80);
  t.key('Z');
  await t.sleep(180);
  check(
    'a quoted display-math body accepts repeated blank lines',
    await t.raw(),
    '> $$\n> x = 1\n> \n> Z\n> $$\n'
  );

  await t.load('> [!NOTE]\n> ::: {.callout .callout-tip}\n> Inner\n> :::\n');
  await t.click(t.prose().querySelector('.markdown-callout-title'));
  await t.sleep(120);
  await clickTextEnd('.markdown-callout-source', 'Inner');
  t.key('Enter');
  await t.sleep(80);
  t.key('Enter');
  await t.sleep(80);
  t.key('Z');
  await t.sleep(180);
  check(
    'a Div inside a callout accepts repeated prefixed blank lines',
    await t.raw(),
    '> [!NOTE]\n> ::: {.callout .callout-tip}\n> Inner\n> \n> Z\n> :::\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
