/**
 * Listings render their labels, captions, IDs, and complete editable source.
 *
 * @covers src/ui/markdown/create_block.ts, src/ui/markdown/syntax/code_fences.ts,
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

  await t.load(
    '# Listings\n\n' +
      '```python {caption="Unnumbered caption"}\nprint(0)\n```\n\n' +
      '```python {#lst:one}\nprint(1)\n```\n\n' +
      '```python {#lst:two caption="Second caption" .numberLines startFrom=7}\nprint(2)\n```\n'
  );

  const listings = [...t.prose().querySelectorAll('.markdown-listing-block')];
  check('three attributed fences render as listings', listings.length, 3);
  check(
    'caption-only is visible without a label',
    listings[0]?.querySelector('.markdown-listing-caption')?.textContent?.trim() ?? null,
    'Unnumbered caption'
  );
  check(
    'ID-only displays its computed label',
    listings[1]?.querySelector('.markdown-listing-caption')?.textContent?.trim() ?? null,
    'Listing 1.'
  );
  check(
    'ID and caption display both',
    listings[2]?.querySelector('.markdown-listing-caption')?.textContent?.trim() ?? null,
    'Listing 2. Second caption'
  );
  check('only the identified blocks carry IDs', listings.map((entry) => entry.id), [
    '',
    'lst:one',
    'lst:two'
  ]);
  check(
    'opening attributes stay hidden outside the block',
    listings.every((entry) => !entry.textContent.includes('caption=')),
    true
  );
  check(
    'the code bodies remain visible',
    listings.map((entry) => entry.querySelector('pre')?.textContent ?? null),
    ['print(0)\n', 'print(1)\n', 'print(2)\n']
  );

  await t.click(listings[2].querySelector('pre'), 0.4);
  await t.sleep(250);
  const source = t.prose().querySelector('.markdown-source-text')?.textContent ?? null;
  check(
    'clicking the listing shows its complete source',
    source,
    '```python {#lst:two caption="Second caption" .numberLines startFrom=7}\nprint(2)\n```'
  );

  await t.click(t.prose().querySelector('h1'), 0.5);
  await t.sleep(250);
  check(
    'leaving source mode restores the rendered listings',
    t.prose().querySelectorAll('.markdown-listing-block').length,
    3
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
