/**
 * Checks the Div-kind picker's callout and theorem groups.
 *
 * Example: a note declares `Claim`, so the theorem group offers Claim while
 * the callout group keeps its own Definition. Choosing Claim writes only its
 * case-sensitive class.
 *
 * @covers src/ui/markdown/editing/div_kind_picker.ts,
 *   src/ui/markdown/choice_card.ts
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
  const openPicker = async (markdown = [
    '---',
    'amsthm:',
    '  plain:',
    '    - Claim',
    '---',
    '',
    'hello world',
    '',
    ''
  ].join('\n')) => {
    await t.load(markdown);
    const blocks = t.blocks();
    const body = blocks[blocks.length - 1];
    await t.click(body, 0.5, 0.5);
    await t.sleep(120);
    await type([':', ':', ':']);
    await type([' ']);
  };
  const rows = () => [
    ...document.querySelectorAll('[data-div-kind-choice]')
  ].filter((row) => row.closest('.hidden') === null);
  const groups = () => [
    ...document.querySelectorAll('[data-choice-group]')
  ].filter((row) => row.closest('.hidden') === null).map((row) => row.textContent);

  await openPicker();
  check('the picker has callout and theorem groups', groups(), ['Callout', 'Theorem']);
  check(
    'the callout Definition remains available',
    rows().some((row) =>
      row.getAttribute('data-div-kind-choice') === 'callout:definition'
    ),
    true
  );
  check(
    'the declared Claim is offered in the theorem group',
    rows().some((row) =>
      row.getAttribute('data-div-kind-choice') === 'theorem:Claim'
    ),
    true
  );

  const claim = rows().find((row) =>
    row.getAttribute('data-div-kind-choice') === 'theorem:Claim'
  );
  claim?.click();
  await t.sleep(300);
  check(
    'choosing Claim writes its exact theorem class',
    await t.raw(),
    '---\namsthm:\n  plain:\n    - Claim\n---\n\nhello world\n\n::: {.Claim}\n\n:::\n\n'
  );

  await openPicker([
    '---',
    'amsthm:',
    '  styles:',
    '    custom-plain: {}',
    '  custom-plain:',
    '    - Axiom',
    '---',
    '',
    'hello world',
    '',
    ''
  ].join('\n'));
  check(
    'a custom style can introduce Axiom in the theorem group',
    rows().some((row) =>
      row.getAttribute('data-div-kind-choice') === 'theorem:Axiom'
    ),
    true
  );
  rows()
    .find((row) => row.getAttribute('data-div-kind-choice') === 'theorem:Axiom')
    ?.click();
  await t.sleep(300);
  check(
    'choosing Axiom writes its exact theorem class',
    await t.raw(),
    [
      '---',
      'amsthm:',
      '  styles:',
      '    custom-plain: {}',
      '  custom-plain:',
      '    - Axiom',
      '---',
      '',
      'hello world',
      '',
      '::: {.Axiom}',
      '',
      ':::',
      '',
      ''
    ].join('\n')
  );

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
