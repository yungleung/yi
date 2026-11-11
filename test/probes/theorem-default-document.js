/**
 * The default fixture demonstrates built-in theorem, proof and empty theorem
 * blocks with an automatic reference.
 *
 * @covers test/fixtures/workspace/default-document.md,
 *   src/ui/markdown/nodes/theorem.ts,
 *   src/ui/markdown/syntax/container/parser_directive.ts
 * @fixture test/fixtures/workspace/default-document.md
 */
(async () => {
  const t = window.__t;
  const read = await window.__TAURI_INTERNALS__.invoke('plugin:fs|read_text_file', {
    path: `${window.__probePaths.checkout}test/fixtures/workspace/default-document.md`
  });
  const fixture = new TextDecoder().decode(
    read instanceof ArrayBuffer ? read : Uint8Array.from(read)
  );
  await t.load(fixture);
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });

  let section = null;
  for (let fraction = 0.02; section === null && fraction <= 1; fraction += 0.02) {
    t.scroller().scrollTop = t.scroller().scrollHeight * fraction;
    await t.sleep(100);
    section = [...t.prose().querySelectorAll('h2')].find(
      (heading) => heading.textContent === 'Theorem blocks'
    ) ?? null;
  }
  await t.sleep(300);

  const titles = new Set();
  const references = new Set();
  let emptyCount = 0;
  for (let step = 0; step < 12; step += 1) {
    for (const title of t.prose().querySelectorAll('.markdown-theorem-title')) {
      titles.add(title.textContent?.trim() ?? '');
    }
    emptyCount = Math.max(
      emptyCount,
      t.prose().querySelectorAll('.markdown-theorem-empty').length
    );
    const reference = t.prose().querySelector('[data-auto-reference="thm:fixture"]');
    if (reference !== null) references.add(reference.textContent);
    t.scroller().scrollTop += 180;
    await t.sleep(120);
  }
  check(
    'the fixture shows theorem and proof headings',
    [...titles],
    ['Theorem 1 (The default theorem).', 'Proof.', 'Theorem 2.']
  );
  check(
    'the fixture reference uses the theorem label',
    [...references],
    ['Theorem 1']
  );
  check(
    'the empty theorem keeps its caret anchor',
    emptyCount,
    1
  );

  const distant = [
    '',
    '::: {#thm:distant .Theorem info="Distant"}',
    'A theorem far from the original section.',
    ':::',
    '',
    'See [#thm:distant].',
    ''
  ].join('\n');
  await t.load(`${fixture}${distant}`);
  for (let fraction = 0.1; fraction <= 1.0001; fraction += 0.02) {
    t.scroller().scrollTop = t.scroller().scrollHeight * fraction;
    await t.sleep(100);
    if (
      [...t.prose().querySelectorAll('.markdown-theorem-title')].some(
        (title) => title.textContent?.trim() === 'Theorem 3 (Distant).'
      ) &&
      t.prose().querySelector('[data-auto-reference="thm:distant"]') !== null
    ) {
      break;
    }
  }
  check(
    'a theorem after the fixture’s labeled equations keeps its number',
    t.prose().querySelector('.markdown-theorem-title')?.textContent?.trim() ?? null,
    'Theorem 3 (Distant).'
  );
  check(
    'and its automatic reference uses that number',
    t.prose()
      .querySelector('[data-auto-reference="thm:distant"]')
      ?.textContent?.trim() ?? null,
    'Theorem 3'
  );

  await t.load('::: {.Definition}\nBody.\n:::');
  check(
    'a non-built-in kind is exact source without a declaration',
    t.prose().querySelector('.markdown-theorem-title') === null &&
      (t.prose().textContent ?? '').includes('::: {.Definition}'),
    true
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
