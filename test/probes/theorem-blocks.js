/**
 * Drives a theorem block through the running editor: its localized heading,
 * parsed body, proof QED mark, automatic reference and exact source reveal.
 *
 * @covers src/ui/markdown/nodes/theorem.ts,
 *   src/ui/markdown/document/reference_index.ts
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

  const text = [
    '---',
    'amsthm:',
    '  name_to_text:',
    '    Theorem: 定理',
    '    proof: 证明',
    '---',
    '',
    '::: {#thm:local .Theorem info="First"}',
    'The body has **weight**.',
    ':::',
    '',
    'See [#thm:local].',
    '',
    '::: proof',
    '显然。',
    ':::'
  ].join('\n');
  await t.load(text);

  const titles = [
    ...t.prose().querySelectorAll('.markdown-theorem-title')
  ].map((node) => node.textContent?.trim() ?? null);
  check('the theorem and proof headings are visible', titles, ['定理 1 (First).', '证明.']);
  check(
    'the theorem body renders Markdown',
    t.prose().querySelector('.markdown-theorem-body strong')?.textContent ?? null,
    'weight'
  );
  check(
    'the automatic reference reads as the same theorem phrase',
    t.prose().querySelector('[data-auto-reference="thm:local"]')?.textContent ?? null,
    '定理 1'
  );
  check(
    'the proof carries one QED mark',
    t.prose().querySelectorAll('.markdown-theorem-qed').length,
    1
  );

  t.prose().querySelector('.markdown-theorem-title')?.click();
  await t.sleep(250);
  check(
    'clicking the theorem title reveals its exact source',
    t.prose().querySelector('.markdown-fenced-div-source')?.textContent ?? null,
    '::: {#thm:local .Theorem info="First"}\nThe body has **weight**.\n:::'
  );
  check('source reveal does not edit the document', await t.raw(), text);

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
