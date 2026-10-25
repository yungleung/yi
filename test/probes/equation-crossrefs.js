/**
 * Automatic equation references use the shared index and navigate to the formula body.
 *
 * @covers src/ui/markdown/document/reference_index.ts,
 *   src/ui/markdown/editing/references.ts, src/ui/markdown/nodes/equation.ts
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
  const commandClick = (element) => {
    const box = element.getBoundingClientRect();
    return element.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        metaKey: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2
      })
    );
  };

  await t.load(
    '---\n' +
      'reference-labels:\n' +
      '  equation: Formula\n' +
      'reference-number-prefixes:\n' +
      '  equation: "2-"\n' +
      '---\n\n' +
      'See [#eq:second] or [the system](#eq:second).\n\n' +
      '[$$\nx=1\n$$]{#eq:first}\n\n' +
      '[$$\n\\begin{align}\ny&=2\\\\\nz&=3\n\\end{align}\n$$]{#eq:second}\n'
  );
  t.scroller().scrollTop = t.scroller().scrollHeight;
  await t.sleep(300);

  const reference = t.prose().querySelector('[data-auto-reference="eq:second"]');
  const manual = t.prose().querySelector(
    'a.markdown-link[href="#eq:second"]:not([data-auto-reference])'
  );
  check(
    'automatic and manual links use the equation target',
    [reference?.textContent ?? null, manual?.textContent ?? null],
    ['Formula (2-2)', 'the system']
  );

  const hash = location.hash;
  const cancelled = reference ? commandClick(reference) : true;
  await t.sleep(300);
  const target = t.prose().querySelector('[id="eq:second"]');
  const source = target?.querySelector('.markdown-equation-source')?.textContent ?? null;
  const body = source?.indexOf('y&=2') ?? -1;
  const caret = t.caretRect();
  const sourceBox = target
    ?.querySelector('.markdown-equation-source')
    ?.getBoundingClientRect() ?? null;
  check('command-click is handled by the editor', cancelled, false);
  check('the location hash stays unchanged', location.hash, hash);
  check(
    'the target reveals its complete equation source',
    source,
    '[$$\n\\begin{align}\ny&=2\\\\\nz&=3\n\\end{align}\n$$]{#eq:second}'
  );
  check('and the source names the formula body', body >= 0, true);
  check(
    'with the caret drawn in that source',
    caret !== null &&
      sourceBox !== null &&
      caret.y >= sourceBox.top - 2 &&
      caret.y <= sourceBox.bottom + 2,
    true
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
