/**
 * Opening delimiters remain paired while editing a quote or callout, and every
 * generated source line carries the container's quote prefix.
 *
 * @covers src/ui/markdown/editing/text_commands.ts,
 *   src/ui/markdown/editing/fence_open.ts
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
  const type = async (keys) => {
    for (const key of keys) {
      t.key(key);
      await t.sleep(70);
    }
    await t.sleep(250);
  };
  const source = () =>
    t.prose().querySelector('.markdown-quote-source, .markdown-callout-source');
  const clickEnd = async (element, needle) => {
    const node = element === null
      ? null
      : [...t.textNodesIn(element)].reverse().find((candidate) => candidate.data.includes(needle));
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
  const lineIs = (raw, line) =>
    raw.split('\n').filter((candidate) => candidate.trimEnd() === line).length;

  await t.load('> Intro\n> ');
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  await clickEnd(source(), '>');
  await type(['$', '$']);
  t.key('Z');
  await t.sleep(220);
  const formula = await t.raw();
  check('display math is paired inside a quote', lineIs(formula, '> $$'), 2);
  check('its caret remains inside the quoted formula', formula.includes('> Z\n'), true);

  await t.load('> Intro\n> ');
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  await clickEnd(source(), '>');
  await type(['[', '$', '$']);
  t.key('Z');
  await t.sleep(220);
  const labeled = await t.raw();
  check('labeled math is paired inside a quote', lineIs(labeled, '> [$$'), 1);
  check('and its closing attributes stay quoted', labeled.includes('> $$]{}\n'), true);
  check('and its caret remains on the quoted formula body', labeled.includes('> Z\n'), true);

  await t.load('> Intro\n> ');
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  await clickEnd(source(), '>');
  await type(['`', '`', '`']);
  t.key('Escape');
  t.key('Z');
  await t.sleep(220);
  const code = await t.raw();
  check(
    'a code fence is paired inside a quote',
    lineIs(code, '> ```'),
    2
  );
  check(
    'its caret remains inside the quoted code',
    code.includes('> Z\n'),
    true
  );

  await t.load('> Intro\n> ');
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  await clickEnd(source(), '>');
  await type([':', ':', ':']);
  const choices = [...document.querySelectorAll('[data-callout-kind-choice]')].map(
    (row) => row.textContent
  );
  check(
    'a default fenced Div is paired inside a quote',
    lineIs(source()?.textContent ?? '', '> :::'),
    2
  );
  check(
    'the Div kind picker still opens inside the quote',
    choices,
    ['Default', 'Note', 'Tip', 'Important', 'Warning', 'Caution', 'Definition']
  );
  document.querySelector('[data-callout-kind-choice="tip"]')?.click();
  await t.sleep(180);
  check(
    'choosing a kind edits the nested Div rather than the outer quote',
    (await t.raw()).includes('> ::: {.callout .callout-tip}'),
    true
  );

  await t.load('> [!NOTE]\n> Body\n> ');
  await t.click(t.prose().querySelector('.markdown-callout-title'));
  await t.sleep(120);
  await clickEnd(source(), '>');
  await type(['$', '$']);
  t.key('Z');
  await t.sleep(220);
  const calloutFormula = await t.raw();
  check('display math is paired inside a callout', lineIs(calloutFormula, '> $$'), 2);
  check(
    'its caret remains inside the callout formula',
    calloutFormula.includes('> Z\n'),
    true
  );

  await t.load('> [!NOTE]\n> Open a fence:\n> ');
  await t.click(t.prose().querySelector('.markdown-callout-title'));
  await t.sleep(120);
  await clickEnd(source(), '>');
  await type(['`', '`', '`']);
  t.key('Escape');
  t.key('Z');
  await t.sleep(220);
  const calloutCode = await t.raw();
  check('a code fence is paired inside a callout', lineIs(calloutCode, '> ```'), 2);
  check(
    'and its caret remains inside the called-out code',
    calloutCode.includes('> Z\n'),
    true
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
