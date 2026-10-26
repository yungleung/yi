/**
 * Listing references infer document vocabulary and navigate to the first code line.
 *
 * @covers src/ui/markdown/document/reference_index.ts, src/ui/markdown/create_block.ts,
 *   src/ui/markdown/editing/references.ts
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

  const filler = Array.from({ length: 60 }, (_, index) => `Paragraph ${index}.`).join('\n\n');
  await t.load(
    '---\n' +
      'reference-labels:\n' +
      '  listing: Code excerpt\n' +
      'reference-number-prefixes:\n' +
      '  listing: "A."\n' +
      '---\n\n' +
      '# Listings\n\n' +
      'See [#lst:two].\n\n' +
      '```python {#lst:one}\nprint(1)\n```\n\n' +
      `${filler}\n\n` +
      '```python {#lst:two caption="Second"}\nprint(2)\n```\n'
  );

  const reference = t.prose().querySelector('[data-auto-reference]');
  check('the reference uses the document label and prefix', reference?.textContent ?? null, 'Code excerpt A.2');
  check('the link names the listing ID', reference?.getAttribute('href') ?? null, '#lst:two');

  const before = location.hash;
  const cancelled = commandClick(reference);
  await t.sleep(300);
  const source = t.prose().querySelector('.markdown-source-text');
  const bodyBox = source?.querySelector('code')?.getBoundingClientRect() ?? null;
  const caret = t.caretRect();
  check('command-click is handled by the editor', cancelled, false);
  check('the webview hash stays unchanged', location.hash, before);
  check(
    'the caret lands at the first code character',
    caret !== null &&
      bodyBox !== null &&
      Math.abs(caret.x - bodyBox.left) < 3 &&
      caret.y >= bodyBox.top - 2 &&
      caret.y <= bodyBox.bottom + 2,
    true
  );
  check(
    'the target reveals its complete source',
    t.prose().querySelector('.markdown-source-text')?.textContent?.includes(
      '{#lst:two caption="Second"}'
    ) ?? false,
    true
  );

  await t.load(
    '# Renumber\n\n' +
      'See [#lst:three].\n\n' +
      '```python {#lst:one}\nprint(1)\n```\n\n' +
      '```python {#lst:two}\nprint(2)\n```\n\n' +
      '```python {#lst:three}\nprint(3)\n```\n'
  );
  check(
    'the automatic reference follows the current sequence',
    t.prose().querySelector('[data-auto-reference]')?.textContent ?? null,
    'Listing 3'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
