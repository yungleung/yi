/**
 * A caption keeps a fast burst typed into its attribute source.
 *
 * @covers src/ui/markdown/nodes/caption.ts,
 *   src/ui/markdown/editing/composition/input.ts,
 *   src/ui/markdown/markdown_editor.ts
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
  const press = (key) =>
    (document.activeElement ?? t.scroller()).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    );
  const active = () => {
    const element = document.activeElement;
    return element
      ? `${element.tagName}.${element.className || ''}`.replace(/\.$/, '')
      : null;
  };

  await t.load('- First\n- Second\n: {#list:named}\n');
  const label = t.prose().querySelector('.markdown-caption-number');
  if (label) {
    await t.click(label, 0.5);
    await t.sleep(250);
  }
  press('ArrowLeft');
  for (const character of ' x=12') {
    press(character);
  }
  await t.sleep(250);
  const listFinalFocus = active();
  check(
    'a burst typed into an ID-only list caption keeps every character',
    await t.raw(),
    '- First\n- Second\n: {#list:named x=12}\n'
  );
  check(
    'the list caption gives the keyboard back afterwards',
    listFinalFocus,
    'TEXTAREA.markdown-composition-input'
  );

  await t.load('| A |\n| --- |\n| 1 |\n: {#tbl:named}\n');
  const tableLabel = t.prose().querySelector('.markdown-caption-number');
  if (tableLabel) {
    await t.click(tableLabel, 0.5);
    await t.sleep(250);
  }
  press('ArrowLeft');
  for (const character of ' x=12') {
    press(character);
  }
  await t.sleep(250);
  const tableFinalFocus = active();
  check(
    'a burst typed into an ID-only table caption keeps every character',
    await t.raw(),
    '| A |\n| --- |\n| 1 |\n: {#tbl:named x=12}\n'
  );
  check(
    'the table caption gives the keyboard back afterwards',
    tableFinalFocus,
    'TEXTAREA.markdown-composition-input'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
