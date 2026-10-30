/**
 * Typing `:::` creates a paired default Div and opens its seven kind choices;
 * choosing a callout adds only that callout's attributes.
 *
 * @covers src/ui/markdown/editing/fence_open.ts,
 *   src/ui/markdown/editing/callout_kind_picker.ts
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
  const emptyFirstLine = async () => {
    await t.load('hello world\n');
    await t.click(t.blocks()[0], 0.5, 0.5);
    await t.sleep(120);
    for (let step = 0; step < 40; step += 1) {
      t.key('ArrowLeft');
    }
    await t.sleep(120);
    t.key('Enter');
    await t.sleep(220);
  };

  await emptyFirstLine();
  await type([':', ':', ':']);
  check(
    'typing three colons creates a closed default Div',
    await t.raw(),
    ':::\n\n:::\n\nhello world\n'
  );
  check(
    'the Div is already showing its editable source',
    t.prose().querySelector('.markdown-fenced-div-source')?.textContent ?? null,
    ':::\n\n:::'
  );
  const rows = [...document.querySelectorAll('[data-callout-kind-choice]')];
  check(
    'the picker offers Default, all five built-in kinds and Definition',
    rows.map((row) => row.textContent),
    ['Default', 'Note', 'Tip', 'Important', 'Warning', 'Caution', 'Definition']
  );
  rows.find((row) => row.getAttribute('data-callout-kind-choice') === 'warning')?.click();
  await t.sleep(300);
  check(
    'choosing Warning changes only the kind class',
    await t.raw(),
    '::: {.callout .callout-warning}\n\n:::\n\nhello world\n'
  );
  t.key('Z');
  await t.sleep(250);
  check(
    'the caret stays on the new body line',
    await t.raw(),
    '::: {.callout .callout-warning}\nZ\n:::\n\nhello world\n'
  );

  await emptyFirstLine();
  await type([':', ':', ':']);
  document.querySelector('[data-callout-kind-choice="default"]')?.click();
  await t.sleep(220);
  check(
    'choosing Default leaves the opening with no attributes',
    await t.raw(),
    ':::\n\n:::\n\nhello world\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
