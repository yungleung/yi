/**
 * The math-heavy fixture renders: the Lagrangian note loads, its formulas are
 * KaTeX (not raw source), and its blocks are a plausible number for its size.
 *
 * @covers src/ui/markdown/nodes/math.ts, virtual_block_renderer.ts
 * @fixture notes/Physics/Theoretic Mechanics/Geometric and Kinematic Foundations of Lagrangian Mechanics.md
 * @needs-workspace
 *
 * Run with:
 *   npm run probe -- --fixture \
 *     "notes/Physics/Theoretic Mechanics/Geometric and Kinematic Foundations of Lagrangian Mechanics.md" \
 *     test/probes/fixture-math-note.js
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const document = await t.raw();
  check('the note loaded', document.length > 15000, true);
  const blocks = t.blocks().length;
  checks.push({
    name: 'blocks are mounted for the visible window',
    actual: blocks,
    expected: 'more than 20',
    pass: blocks > 20
  });
  const renderedFormulas = new Set();
  let rawSource = 0;
  for (let fraction = 0; fraction <= 1.0001; fraction += 0.1) {
    t.scroller().scrollTop = t.scroller().scrollHeight * fraction;
    await t.sleep(150);
    for (const formula of t.prose().querySelectorAll('.katex')) {
      renderedFormulas.add(formula);
    }
    rawSource = Math.max(
      rawSource,
      t.prose().querySelectorAll('.markdown-source-text').length
    );
  }
  const formulas = renderedFormulas.size;
  checks.push({
    name: 'the visible formulas are rendered with KaTeX',
    actual: formulas,
    expected: 'more than 3',
    pass: formulas > 3
  });
  check('and no display formula is left as raw source', rawSource, 0);
  return { checks, blocks, formulas, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
