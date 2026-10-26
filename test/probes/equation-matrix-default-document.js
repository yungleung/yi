/**
 * The default fixture demonstrates every equation environment with and without an ID.
 *
 * @covers test/fixtures/workspace/default-document.md,
 *   src/ui/markdown/syntax/equation_blocks.ts,
 *   src/ui/markdown/document/reference_index.ts
 * @fixture test/fixtures/workspace/default-document.md
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

  const raw = await t.raw();
  const { splitBlocks } = await t.app('/src/ui/markdown/document/blocks.ts');
  const { referenceIndex } = await t.app(
    '/src/ui/markdown/document/reference_index.ts'
  );
  const equations = referenceIndex(raw).filter((entry) => entry.kind === 'equation');
  check(
    'the fixture indexes one labeled equation in every matrix row',
    equations.map((entry) => entry.id),
    [
      'eq:plain',
      'eq:equation',
      'eq:equation-star',
      'eq:align',
      'eq:align-star',
      'eq:aligned',
      'eq:gather',
      'eq:gather-star',
      'eq:gathered',
      'eq:alignat',
      'eq:alignat-star',
      'eq:alignedat',
      'eq:split'
    ]
  );
  check(
    'the fixture has a labeled and unlabeled block for every matrix row',
    [
      splitBlocks(raw).filter((block) => block.kind === 'equation').length,
      splitBlocks(raw).filter((block) => block.kind === 'displayMath').length
    ],
    [13, 13]
  );

  const heading = [...t.prose().querySelectorAll('h2')].find(
    (candidate) => candidate.textContent === 'Equation cross-references'
  );
  heading?.scrollIntoView({ block: 'start' });
  await t.sleep(400);
  const reference = t.prose().querySelector('[data-auto-reference="eq:plain"]');
  check('the automatic reference uses the configured equation label', reference?.textContent ?? null, 'Formula (2-1)');
  check(
    'the visible labeled equation uses only its number',
    t.prose().querySelector('[id="eq:plain"] .markdown-equation-number')?.textContent ?? null,
    '(2-1)'
  );
  check(
    'KaTeX row-number tags do not appear in mounted equations',
    t.prose().querySelectorAll('.markdown-equation-block .eqn-num').length,
    0
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
