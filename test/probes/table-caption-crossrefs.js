/**
 * Automatic table references use the shared index and land in the first header cell.
 *
 * @covers src/ui/markdown/document/reference_index.ts,
 *   src/ui/markdown/editing/references.ts, src/ui/markdown/nodes/table_caption.ts
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
      '  table: Data table\n' +
      'reference-number-prefixes:\n' +
      '  table: "A."\n' +
      '---\n\n' +
      '# Tables\n\n' +
      'See [#tbl:results].\n\n' +
      '| A | B |\n' +
      '| --- | --- |\n' +
      '| 1 | 2 |\n\n' +
      ': Results {#tbl:results}\n'
  );
  const reference = t.prose().querySelector('[data-auto-reference="tbl:results"]');
  check('the reference uses the document label and prefix', reference?.textContent ?? null, 'Data table A.1');
  const hash = location.hash;
  const cancelled = reference ? commandClick(reference) : true;
  await t.sleep(300);
  const cell = t.prose().querySelector('[data-table-cell="0:0"]')?.getBoundingClientRect() ?? null;
  const caret = t.caretRect();
  check('command-click is handled by the editor', cancelled, false);
  check('the hash stays unchanged', location.hash, hash);
  check(
    'the caret lands in the first header cell',
    cell !== null &&
      caret !== null &&
      caret.x >= cell.left - 2 &&
      caret.x <= cell.right + 2 &&
      caret.y >= cell.top - 2 &&
      caret.y <= cell.bottom + 2,
    true
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
