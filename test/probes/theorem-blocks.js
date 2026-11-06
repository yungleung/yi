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
    '::: {#thm:local .Theorem info="**First**"}',
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
    'the theorem note renders inline Markdown',
    t.prose().querySelector('.markdown-theorem-title strong')?.textContent ?? null,
    'First'
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
    '::: {#thm:local .Theorem info="**First**"}\nThe body has **weight**.\n:::'
  );
  check('source reveal does not edit the document', await t.raw(), text);

  await t.load('::: {.Theorem}\n\n:::');
  const empty = t.prose().querySelector('.markdown-theorem-empty');
  check('an empty theorem keeps a visible body caret anchor', empty !== null, true);
  empty?.click();
  await t.sleep(180);
  t.key('X');
  await t.sleep(180);
  check(
    'typing at the empty theorem anchor creates its body line',
    await t.raw(),
    '::: {.Theorem}\nX\n:::'
  );

  const declared = [
    '---',
    'amsthm:',
    '  styles:',
    '    custom-definition: {}',
    '  custom-definition:',
    '    - Definition',
    '    - Axiom',
    '---',
    '',
    '::: {#ax:choice .Axiom}',
    'Every vector space has a basis.',
    ':::',
    '',
    'See [#ax:choice].'
  ].join('\n');
  await t.load(declared);
  check(
    'a user-declared Axiom renders as a theorem block',
    t.prose().querySelector('.markdown-theorem-title')?.textContent?.trim() ?? null,
    'Axiom 1.'
  );
  check(
    'the Axiom body renders',
    t.prose().querySelector('.markdown-theorem-body')?.textContent?.trim() ?? null,
    'Every vector space has a basis.'
  );
  check(
    'the Axiom reference resolves',
    t.prose()
      .querySelector('[data-auto-reference="ax:choice"]')
      ?.textContent?.trim() ?? null,
    'Axiom 1'
  );

  await t.load(declared.replace('    - Definition\n    - Axiom\n', ''));
  check(
    'removing the declaration returns Axiom to exact source',
    t.prose().querySelector('.markdown-theorem-title') === null &&
      (t.prose().textContent ?? '').includes('::: {#ax:choice .Axiom}'),
    true
  );

  const unclosed = [
    '---',
    'amsthm:',
    '  styles:',
    '    custom-definition: {}',
    '  custom-definition:',
    '    - Axiom',
    '---',
    '',
    '::: {.Axiom}',
    'A completed declaration.'
  ].join('\n');
  await t.load(unclosed);
  check(
    'an unclosed declared Div remains exact source',
    t.prose().querySelector('.markdown-theorem-title') === null &&
      (t.prose().textContent ?? '').includes('::: {.Axiom}'),
    true
  );
  const runtime = await t.app('/src/commands/runtime.ts');
  const position = await runtime.dispatchCommand(
    'document:getRevision',
    null,
    { kind: 'toolbar' },
    { correlationId: 'theorem-block-closing-fence' }
  );
  const edit = await runtime.dispatchCommand(
    'document:replaceRange',
    {
      ...position.value,
      from: unclosed.length,
      to: unclosed.length,
      replacement: '\n:::\n\nAfter.'
    },
    { kind: 'toolbar' },
    { correlationId: 'theorem-block-closing-fence' }
  );
  check('the closing-fence edit is accepted', edit.ok, true);
  await t.sleep(300);
  check(
    'closing the fence reclassifies the existing Div as the declared kind',
    t.prose().querySelector('.markdown-theorem-title')?.textContent?.trim() ?? null,
    'Axiom 1.'
  );
  check(
    'the closing fence is retained in the source',
    await t.raw(),
    `${unclosed}\n:::\n\nAfter.`
  );

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
