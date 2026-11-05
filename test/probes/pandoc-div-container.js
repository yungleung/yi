/**
 * Generic Pandoc Divs use the editor's context-aware container behavior.
 *
 * @covers src/ui/markdown/editing/text/index.ts,
 *   src/ui/markdown/editing/fence_open.ts,
 *   src/ui/markdown/syntax/container/divs.ts
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
  const source = () =>
    t.prose().querySelector('.markdown-fenced-div-source, .markdown-callout-source');
  const clickOffset = async (offset) => {
    const node = source() === null ? null : t.textNodesIn(source())[0];
    if (!node || offset < 0 || offset > node.data.length) return false;
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const box = range.getBoundingClientRect();
    const target = node.parentElement;
    const event = {
      bubbles: true,
      cancelable: true,
      clientX: box.left + 0.5,
      clientY: box.top + box.height / 2
    };
    target.dispatchEvent(new PointerEvent('pointerdown', event));
    target.dispatchEvent(new PointerEvent('pointerup', event));
    target.dispatchEvent(new MouseEvent('click', event));
    await t.sleep(120);
    return true;
  };
  const clickText = async (needle, after = true, last = false) => {
    const root = source();
    const nodes = root === null ? [] : t.textNodesIn(root);
    const candidates = nodes.filter((node) => node.data.includes(needle));
    const node = last ? candidates.at(-1) : candidates[0];
    const found = node?.data.indexOf(needle) ?? -1;
    if (!node || found < 0) return false;
    const offset = found + (after ? needle.length : 0);
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const box = range.getBoundingClientRect();
    const target = node.parentElement;
    const event = {
      bubbles: true,
      cancelable: true,
      clientX: box.left + 0.5,
      clientY: box.top + box.height / 2
    };
    target.dispatchEvent(new PointerEvent('pointerdown', event));
    target.dispatchEvent(new PointerEvent('pointerup', event));
    target.dispatchEvent(new MouseEvent('click', event));
    await t.sleep(120);
    return true;
  };

  await t.load(':::\n:::\n');
  await clickText(':::', true, false);
  t.key('Enter');
  await t.sleep(220);
  t.key('X');
  await t.sleep(220);
  check(
    'Enter opens the body of an empty generic Div',
    await t.raw(),
    ':::\nX\n:::\n'
  );

  await t.load(':::\n:::\n');
  await clickOffset(':::\n'.length);
  t.key('Y');
  await t.sleep(220);
  check(
    'typing at an empty generic Div body insertion creates its own line',
    await t.raw(),
    ':::\nY\n:::\n'
  );

  await t.load('::: {.incremental}\n- One\n:::\n');
  await clickText('One', true);
  t.key('Enter');
  await t.sleep(220);
  check(
    'Enter at the end of a list item continues that item in a generic Div',
    await t.raw(),
    '::: {.incremental}\n- One\n- \n:::\n'
  );
  t.key('Enter');
  await t.sleep(220);
  check(
    'Enter on the empty list item returns to a plain generic Div line',
    await t.raw(),
    '::: {.incremental}\n- One\n\n:::\n'
  );

  await t.load('::: {.notes}\nBody\n:::\n');
  await clickText('Body', true);
  t.key('`');
  await t.sleep(220);
  check(
    'a single backtick stays literal in a generic Div',
    await t.raw(),
    '::: {.notes}\nBody`\n:::\n'
  );

  await t.load('::: {.callout .callout-note}\nBody\n:::\n');
  await t.click(t.prose().querySelector('.markdown-callout-title'));
  await t.sleep(160);
  await clickText('Body', true);
  t.key('`');
  await t.sleep(220);
  check(
    'a single backtick stays literal in a callout Div',
    await t.raw(),
    '::: {.callout .callout-note}\nBody`\n:::\n'
  );

  await t.load(':::\n\n:::\n');
  await clickOffset(':::\n'.length);
  t.key('[');
  await t.sleep(220);
  check(
    'other bracket pairs still work inside a generic Div',
    await t.raw(),
    ':::\n[]\n:::\n'
  );

  await t.load(':::\n\n:::\n');
  await clickOffset(':::\n'.length);
  for (let typed = 0; typed < 3; typed += 1) {
    t.key('`');
    await t.sleep(80);
  }
  await t.sleep(220);
  const code = await t.raw();
  check(
    'three typed backticks open a fenced code block inside a generic Div',
    (code.match(/```/g) ?? []).length,
    2
  );
  check(
    'and the code fence language picker opens from the generic Div',
    document.querySelectorAll('[data-language]').length > 100,
    true
  );
  document.querySelector('[data-language="python"]')?.click();
  await t.sleep(220);
  check(
    'choosing a language edits the nested code fence',
    (await t.raw()).includes('\n```python\n'),
    true
  );

  await t.load(':::\n\n:::\n');
  await clickOffset(':::\n'.length);
  t.key('$');
  await t.sleep(80);
  t.key('$');
  await t.sleep(220);
  const formula = await t.raw();
  check(
    'a display formula opens inside a generic Div',
    (formula.match(/\$\$/g) ?? []).length,
    2
  );

  await t.load(':::\n\n:::\n');
  await clickOffset(':::\n'.length);
  for (let typed = 0; typed < 4; typed += 1) {
    t.key(':');
    await t.sleep(80);
  }
  t.key(' ');
  await t.sleep(100);
  check(
    'a nested callout opens from a generic Div',
    [...document.querySelectorAll('[data-div-kind-choice]')].map(
      (row) => row.textContent
    ),
    [
      'Default',
      'Note',
      'Tip',
      'Important',
      'Warning',
      'Caution',
      'Definition',
      'Corollary',
      'Definition',
      'Example',
      'Exercise',
      'Lemma',
      'Notation',
      'Problem',
      'Proof',
      'Proposition',
      'Remark',
      'Theorem',
      'Vocabulary'
    ]
  );

  await t.load('::: {.callout .callout-note}\n\n:::\n');
  await t.click(t.prose().querySelector('.markdown-callout-title'));
  await t.sleep(160);
  await clickOffset('::: {.callout .callout-note}\n'.length);
  for (let typed = 0; typed < 4; typed += 1) {
    t.key(':');
    await t.sleep(80);
  }
  t.key(' ');
  await t.sleep(100);
  const visibleKinds = [...document.querySelectorAll('[data-div-kind-choice]')].filter(
    (row) => row.closest('.hidden') === null
  );
  check(
    'a nested default Div opens the kind picker inside a callout',
    visibleKinds.find((row) => row.classList.contains('bg-base-300'))?.dataset
      .divKindChoice ?? null,
    'default'
  );
  visibleKinds.find((row) => row.dataset.divKindChoice === 'callout:warning')?.click();
  await t.sleep(220);
  check(
    'choosing a nested kind changes the inner Div and preserves the outer attributes',
    await t.raw(),
    '::: {.callout .callout-note}\n\n:::: {.callout .callout-warning}\n\n::::\n\n\n:::\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
