/**
 * Empty callouts remain reachable from both sides.
 *
 * @covers src/ui/markdown/nodes/callout.ts,
 *   src/ui/markdown/caret/navigation.ts
 */
(async () => {
  const t = window.__t;
  const caret = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const clickBoundary = async (element, side) => {
    const text = t.textNodesIn(element).find((node) => node.data.length > 0);
    if (!text) {
      return false;
    }
    const range = document.createRange();
    const at = side === 'end' ? text.data.length - 1 : 0;
    range.setStart(text, at);
    range.setEnd(text, at + 1);
    const box = range.getBoundingClientRect();
    const event = {
      bubbles: true,
      cancelable: true,
      clientX: side === 'end' ? box.right - 0.5 : box.left + 0.5,
      clientY: box.top + box.height / 2
    };
    const target = text.parentElement;
    target.dispatchEvent(new PointerEvent('pointerdown', event));
    target.dispatchEvent(new PointerEvent('pointerup', event));
    target.dispatchEvent(new MouseEvent('click', event));
    await t.sleep(60);
    return true;
  };
  const source = () => t.prose().querySelector('.markdown-callout-source');

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
    await clickBoundary(before, 'end');
    t.key('ArrowRight');
    await t.sleep(120);
    check(
      `${name}: one right arrow enters the empty callout`,
      source() !== null,
      true
    );

    const after = [...t.prose().querySelectorAll('p')].find(
      (node) => node.textContent === 'After'
    );
    if (after) {
      await clickBoundary(after, 'start');
      t.key('ArrowLeft');
      await t.sleep(120);
    }
    check(
      `${name}: one left arrow returns to the empty callout`,
      source() !== null,
      true
    );
    check(`${name}: navigation changes no source`, await t.raw(), markdown);
  }

  await t.load('Before\n\n> Intro\n>\n> > [!TIP]\n\nAfter\n');
  const beforeNested = [...t.prose().querySelectorAll('p')].find(
    (node) => node.textContent === 'Before'
  );
  await clickBoundary(beforeNested, 'end');
  t.key('ArrowRight');
  await t.sleep(120);
  check(
    'navigation reaches quoted text before a nested empty callout',
    [
      source() === null,
      caret.getCaretRange()?.startContainer.textContent?.includes('Intro') ?? false
    ],
    [true, true]
  );

  await t.load('Before\n\n> [!NOTE]\n\n> [!TIP]\n\nAfter\n');
  check(
    'adjacent empty callouts keep two distinct anchors',
    t.prose().querySelectorAll('[data-callout-body-anchor]').length,
    2
  );
  const beforeAdjacent = [...t.prose().querySelectorAll('p')].find(
    (node) => node.textContent === 'Before'
  );
  await clickBoundary(beforeAdjacent, 'end');
  t.key('ArrowRight');
  await t.sleep(120);
  const firstSource = source()?.textContent ?? null;
  t.key('ArrowRight');
  await t.sleep(120);
  check(
    'adjacent empty callouts are separate navigation stops',
    [firstSource, source()?.textContent ?? null],
    ['> [!NOTE]', '> [!TIP]']
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
