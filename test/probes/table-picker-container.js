/**
 * The visible table picker keeps a quote or callout's carrier on every row it
 * creates, not only when the command is invoked through the registry.
 *
 * @covers src/ui/toolbar/table_picker.ts, src/ui/markdown/editing/table.ts
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
  const button = [...document.querySelectorAll('button')].find(
    (element) => element.getAttribute('aria-label') === 'Insert table'
  );
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
  const insertFromPicker = async () => {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.click();
    await t.sleep(120);
    button.parentElement
      .querySelector('.grid-cols-10')
      .querySelector('button[data-row="3"][data-column="2"]')
      .click();
    await t.sleep(250);
  };
  const tableRows = (raw) => raw.split('\n').filter((line) => line.includes('|'));

  await t.load('Before\n\n> Quoted text.\n');
  await clickTextEnd('Quoted text.');
  await insertFromPicker();
  const quoted = await t.raw();
  check(
    'the picker keeps a quote open around every table row',
    tableRows(quoted).length === 4 && tableRows(quoted).every((line) => line.startsWith('> |')),
    true
  );
  check(
    'the quote text and table separator stay in the quote',
    quoted.startsWith('Before\n\n> Quoted text.\n> \n> |'),
    true
  );

  await t.load('Before\n\n> [!NOTE]\n> Callout body.\n');
  await clickTextEnd('Callout body.');
  await insertFromPicker();
  const callout = await t.raw();
  check(
    'the picker keeps a callout open around every table row',
    tableRows(callout).length === 4 && tableRows(callout).every((line) => line.startsWith('> |')),
    true
  );
  check(
    'the callout marker, body and table separator stay in the callout',
    callout.startsWith('Before\n\n> [!NOTE]\n> Callout body.\n> \n> |'),
    true
  );

  await t.load('::: {.columns}\nDiv body.\n:::\n');
  await clickTextEnd('Div body.');
  await insertFromPicker();
  const generic = await t.raw();
  check(
    'the picker keeps a generic Pandoc Div open around every table row',
    tableRows(generic).length === 4 && tableRows(generic).every((line) => line.startsWith('|')),
    true
  );
  check(
    'the generic Div opening, body and table separator stay in the Div',
    generic.startsWith('::: {.columns}\nDiv body.\n\n|') &&
      generic.endsWith('\n:::\n'),
    true
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
