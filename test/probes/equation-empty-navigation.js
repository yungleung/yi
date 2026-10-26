/**
 * Left from the line below an empty labeled equation enters the equation source.
 *
 * @covers src/ui/markdown/caret/navigation.ts,
 *   src/ui/markdown/nodes/equation.ts
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

  await t.load('Before.\n\n[$$\n\n$$]{}\n\nAfter.\n');
  const after = [...t.prose().querySelectorAll('p')].find(
    (paragraph) => paragraph.textContent === 'After.'
  );
  await t.click(after, 0.01, 0.5);
  t.key('ArrowLeft');
  await t.sleep(250);

  const source = t.prose().querySelector('.markdown-equation-source');
  const caret = t.caretRect();
  const box = source?.getBoundingClientRect() ?? null;
  check(
    'Left reveals the empty equation source',
    source?.textContent ?? null,
    '[$$\n\n$$]{}'
  );
  check(
    'and puts the caret inside that source',
    caret !== null &&
      box !== null &&
      caret.y >= box.top - 2 &&
      caret.y <= box.bottom + 2,
    true
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
