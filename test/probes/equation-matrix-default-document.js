/**
 * The default fixture demonstrates every equation environment with and without an ID.
 *
 * @covers test/fixtures/workspace/default-document.md,
 *   src/ui/markdown/syntax/equation/index.ts,
 *   src/ui/markdown/document/reference_index.ts
 * @fixture test/fixtures/workspace/default-document.md
 */
(async () => {
  const t = window.__t;
  const read = await window.__TAURI_INTERNALS__.invoke('plugin:fs|read_text_file', {
    path: `${window.__probePaths.checkout}test/fixtures/workspace/default-document.md`
  });
  const note = new TextDecoder().decode(
    read instanceof ArrayBuffer ? read : Uint8Array.from(read)
  );
  await t.load(note);
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

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const heading = [...t.prose().querySelectorAll('h2')].find(
      (candidate) => candidate.textContent === 'Equation cross-references'
    );
    if (heading) {
      heading.scrollIntoView({ block: 'start' });
      break;
    }
    const scroller = t.scroller();
    if (scroller) {
      scroller.scrollTop += 320;
    }
    await t.sleep(100);
  }
  await t.sleep(400);
  let reference = null;
  let numbered = null;
  for (let attempt = 0; attempt < 8 && (reference === null || numbered === null); attempt += 1) {
    reference = t.prose().querySelector('[data-auto-reference="eq:plain"]');
    numbered = t.prose().querySelector('[id="eq:plain"] .markdown-equation-number');
    if (reference === null || numbered === null) {
      const scroller = t.scroller();
      if (scroller) {
        scroller.scrollTop += 240;
      }
      await t.sleep(200);
    }
  }
  check('the automatic reference uses the configured equation label', reference?.textContent ?? null, 'Formula (2-1)');
  check(
    'the visible labeled equation uses only its number',
    numbered?.textContent ?? null,
    '(2-1)'
  );
  check(
    'KaTeX row-number tags do not appear in mounted equations',
    t.prose().querySelectorAll('.markdown-equation-block .eqn-num').length,
    0
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
