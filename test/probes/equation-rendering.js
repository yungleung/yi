/**
 * Labeled equations render KaTeX with one Yi number and reveal their full source.
 *
 * @covers src/ui/markdown/create_block.ts, src/ui/markdown/nodes/equation.ts,
 *   src/ui/markdown/syntax/equation_blocks.ts
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

  await t.load(
    'See [#eq:plain] and [#eq:align].\n\n' +
      '[$$\nE=mc^2\n$$]{#eq:plain}\n\n' +
      '[$$\n\\begin{align}\nx&=1\\\\\ny&=2\n\\end{align}\n$$]{#eq:align .wide}\n'
  );
  const plain = t.prose().querySelector('.markdown-equation-block[id="eq:plain"]');
  const align = t.prose().querySelector('.markdown-equation-block[id="eq:align"]');
  check('plain equation block renders', plain !== null, true);
  check('align equation block renders', align !== null, true);
  check(
    'each block carries one Yi label',
    [
      plain?.querySelector('.markdown-equation-number')?.textContent ?? null,
      align?.querySelector('.markdown-equation-number')?.textContent ?? null
    ],
    ['Equation (1)', 'Equation (2)']
  );
  check(
    'KaTeX environment numbering is absent',
    [
      plain?.querySelectorAll('.eqn-num').length ?? -1,
      align?.querySelectorAll('.eqn-num').length ?? -1
    ],
    [0, 0]
  );
  check('arbitrary classes stay out of the editor', align?.classList.contains('wide') ?? true, false);

  const alignView = align?.querySelector('.markdown-equation-view') ?? null;
  if (alignView) {
    await t.click(alignView, 0.5);
    await t.sleep(250);
  }
  check(
    'clicking reveals the complete wrapper',
    t.prose().querySelector('.markdown-equation-source')?.textContent ?? null,
    '[$$\n\\begin{align}\nx&=1\\\\\ny&=2\n\\end{align}\n$$]{#eq:align .wide}'
  );

  await t.load('$$\n\\begin{align}\ny&=2\\\\\nz&=3\n\\end{align}\n$$\n');
  check(
    'an unlabeled environment renders without a native row number',
    t.prose().querySelectorAll('.markdown-display-math .eqn-num').length,
    0
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
