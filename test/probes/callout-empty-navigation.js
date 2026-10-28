/**
 * Empty callouts remain reachable from both sides.
 *
 * @covers src/ui/markdown/nodes/callout.ts,
 *   src/ui/markdown/caret/navigation.ts
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
  const until = async (matches, key) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (matches()) {
        return true;
      }
      t.key(key);
      await t.sleep(150);
    }
    return matches();
  };

  const cases = [
    ['GitHub', 'Before\n\n> [!NOTE]\n\nAfter\n'],
    ['fenced Div', 'Before\n\n::: {.callout .callout-note}\n:::\n\nAfter\n'],
    ['nested GitHub', 'Before\n\n> > [!TIP]\n\nAfter\n'],
    [
      'quoted fenced Div',
      'Before\n\n> ::: {.callout .callout-warning}\n> :::\n\nAfter\n'
    ]
  ];

  for (const [name, markdown] of cases) {
    await t.load(markdown);
    const before = [...t.prose().querySelectorAll('p')].find(
      (node) => node.textContent === 'Before'
    );
    await t.click(before, 0.99);
    await until(() => t.prose().querySelector('.markdown-callout-source') !== null, 'ArrowRight');
    check(
      `${name}: right arrow enters the empty callout`,
      t.prose().querySelector('.markdown-callout-source') !== null,
      true
    );

    const after = [...t.prose().querySelectorAll('p')].find(
      (node) => node.textContent === 'After'
    );
    if (after) {
      await t.click(after, 0.01);
      await until(() => t.prose().querySelector('.markdown-callout-source') !== null, 'ArrowLeft');
    }
    check(
      `${name}: left arrow returns to the empty callout`,
      t.prose().querySelector('.markdown-callout-source') !== null,
      true
    );
    check(`${name}: navigation changes no source`, await t.raw(), markdown);
  }

  await t.load('Before\n\n> [!NOTE]\n\n> [!TIP]\n\nAfter\n');
  check(
    'adjacent empty callouts keep two distinct anchors',
    t.prose().querySelectorAll('[data-callout-body-anchor]').length,
    2
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
