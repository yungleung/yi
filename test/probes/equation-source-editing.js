/**
 * An unlabeled equation stays visible while its attributes are being edited,
 * and a click in its revealed source lands on the line and character clicked.
 *
 * @covers src/ui/markdown/syntax/equation_blocks.ts,
 *   src/ui/markdown/nodes/equation.ts, src/ui/markdown/create_block.ts
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
  const gesture = async (node, offset) => {
    const range = document.createRange();
    range.setStart(node, offset);
    range.setEnd(node, Math.min(offset + 1, node.data.length));
    const box = range.getBoundingClientRect();
    const at = {
      bubbles: true,
      cancelable: true,
      clientX: box.left + Math.min(1, box.width / 2),
      clientY: box.top + box.height / 2
    };
    const target = node.parentElement;
    target.dispatchEvent(new PointerEvent('pointerdown', at));
    target.dispatchEvent(new PointerEvent('pointerup', at));
    target.dispatchEvent(new MouseEvent('click', at));
    await t.sleep(200);
  };
  const equation = (index = 0) =>
    [...t.prose().querySelectorAll('.markdown-equation-block')][index] ?? null;
  const source = () =>
    t.prose().querySelector('.markdown-equation-source') ?? null;
  const sourceNode = (needle) =>
    [...t.textNodesIn(source())].find((node) => node.data.includes(needle)) ?? null;

  await t.load(
    'Before.\n\n' +
      '[$$\nx = 1\ny = 2\n$$]{}\n\n' +
      '[$$\nz = 3\n$$]{.wide data-owner=demo}\n\n' +
      'After.\n'
  );
  check(
    'equations without IDs render even without other attributes',
    equation(0)?.querySelector('.markdown-equation-view') !== null,
    true
  );
  check(
    'equations without IDs render with classes and key/value attributes',
    equation(1)?.querySelector('.markdown-equation-view') !== null,
    true
  );
  check(
    'unlabeled equations consume no visible equation number',
    t.prose().querySelectorAll('.markdown-equation-number').length,
    0
  );

  await t.click(equation(0).querySelector('.markdown-equation-view'), 0.5, 0.5);
  await t.sleep(200);
  const body = sourceNode('y = 2');
  if (body) {
    await gesture(body, body.data.indexOf('y = 2') + 2);
  }
  t.key('Z');
  await t.sleep(200);
  const withCaret = await t.raw();
  check(
    'a click in the body puts the next character on the line clicked',
    withCaret.includes('\ny Z= 2\n'),
    true
  );
  check(
    'and never sends that character to the document boundary',
    withCaret.startsWith('Z'),
    false
  );

  await t.load('[$$\nz = 3\n$$]{.wide data-owner=demo}\n\nAfter.\n');
  await t.click(equation(0).querySelector('.markdown-equation-view'), 0.5, 0.5);
  await t.sleep(200);
  const closing = sourceNode('demo}');
  if (closing) {
    await gesture(closing, closing.data.length);
  }
  t.key(' ');
  t.key('#');
  await t.sleep(200);
  check(
    'an unfinished attribute token keeps the equation in the document',
    (await t.raw()).includes('$$]{.wide data-owner=demo} #\n\nAfter.\n'),
    true
  );
  check(
    'and keeps its complete source visible for editing',
    source()?.textContent ?? null,
    '[$$\nz = 3\n$$]{.wide data-owner=demo} #'
  );
  const after = [...t.prose().querySelectorAll('p')].find(
    (paragraph) => paragraph.textContent === 'After.'
  );
  await t.click(after);
  await t.sleep(200);
  check(
    'leaving the invalid attribute restores the formula view',
    equation(0)?.querySelector('.markdown-equation-view')?.textContent ?? null,
    'z=3'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
