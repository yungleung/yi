/**
 * Formatting a selection in a quote, callout or Div keeps every source line:
 * it changes only the selected text's markers.
 *
 * @covers src/ui/markdown/editing/formatting.ts,
 *   src/ui/markdown/format_dom.ts,
 *   src/ui/markdown/caret/offsets.ts
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
  const formatButton = (label) =>
    [...document.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === label
    );
  const selectText = async (needle) => {
    const node = [...t.textNodesIn(t.blocks()[0])].find((text) =>
      text.data.includes(needle)
    );
    if (!node) return false;
    const at = node.data.indexOf(needle);
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + needle.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    await t.sleep(120);
    return true;
  };
  const pressFormat = async (label = 'Bold') => {
    const target = formatButton(label);
    target?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    target?.click();
    await t.sleep(250);
  };

  await t.load('> First line\n> Second line\n\nTail\n');
  check('the quote selection is ready', await selectText('Second'), true);
  await pressFormat();
  await t.click(t.blocks()[1]);
  await t.sleep(180);
  check(
    'quote formatting wraps only the selected word',
    await t.raw(),
    '> First line\n> **Second** line\n\nTail\n'
  );
  check(
    'the quote keeps both source lines after formatting',
    t.blocks()[0].textContent?.includes('First line\nSecond') ?? false,
    true
  );

  await t.load('> [!NOTE]\n> First line\n> Second line\n\nTail\n');
  check('the callout selection is ready', await selectText('Second'), true);
  await pressFormat();
  await t.click(t.blocks()[1]);
  await t.sleep(180);
  check(
    'callout formatting wraps only the selected word',
    await t.raw(),
    '> [!NOTE]\n> First line\n> **Second** line\n\nTail\n'
  );
  check(
    'the callout keeps both body lines after formatting',
    t.blocks()[0].textContent?.includes('First line\nSecond') ?? false,
    true
  );

  await t.load(
    '::: {.callout .callout-note}\nFirst line\n\nSecond line\n:::\n\nTail\n'
  );
  await t.click(t.prose().querySelector('.markdown-callout-title'));
  await t.sleep(180);
  check(
    'the fenced-callout selection is ready',
    await selectText('Second'),
    true
  );
  await pressFormat();
  check(
    'the formatted Div callout remains a multiline source view',
    t.blocks()[0].querySelector('.markdown-callout-source')?.tagName ?? null,
    'PRE'
  );
  check(
    'and every source line is still present',
    t.blocks()[0].textContent?.split('\n').length ?? 0,
    5
  );
  check(
    'the Div source has the expected markers',
    await t.raw(),
    '::: {.callout .callout-note}\nFirst line\n\n**Second** line\n:::\n\nTail\n'
  );

  await t.load('::: {.columns}\nFirst line\n\nSecond line\n:::\n');
  check('the generic Div selection is ready', await selectText('Second'), true);
  await pressFormat();
  check(
    'the formatted generic Div remains a multiline source view',
    t.blocks()[0].querySelector('.markdown-fenced-div-source')?.tagName ?? null,
    'PRE'
  );
  check(
    'and its source lines are all present',
    t.blocks()[0].textContent?.split('\n').length ?? 0,
    5
  );
  check(
    'the generic Div source has the expected markers',
    await t.raw(),
    '::: {.columns}\nFirst line\n\n**Second** line\n:::\n'
  );

  await t.load('> First line\n> Second line\n\nTail\n');
  check(
    'a one-character format selection is ready',
    await selectText('Second'),
    true
  );
  await pressFormat('Inline code');
  await t.click(t.blocks()[1]);
  await t.sleep(180);
  check(
    'inline code in a quote preserves the carrier and both lines',
    await t.raw(),
    '> First line\n> `Second` line\n\nTail\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
