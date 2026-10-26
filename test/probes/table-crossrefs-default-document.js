/**
 * The default fixture demonstrates table numbering, targets, and both link forms.
 *
 * @covers test/fixtures/workspace/default-document.md,
 *   src/ui/markdown/editing/references.ts, src/ui/markdown/nodes/caption.ts
 * @fixture test/fixtures/workspace/default-document.md
 */
(async () => {
  const t = window.__t;
  const read = await window.__TAURI_INTERNALS__.invoke('plugin:fs|read_text_file', {
    path: `${window.__probePaths.checkout}test/fixtures/workspace/default-document.md`
  });
  await t.load(
    new TextDecoder().decode(read instanceof ArrayBuffer ? read : Uint8Array.from(read))
  );
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

  let heading = null;
  for (let fraction = 0.1; heading === null && fraction <= 1; fraction += 0.1) {
    t.scroller().scrollTop = t.scroller().scrollHeight * fraction;
    await t.sleep(100);
    heading = [...t.prose().querySelectorAll('h2')].find(
      (candidate) => candidate.textContent === 'Tables'
    );
  }
  heading?.scrollIntoView({ block: 'start' });
  await t.sleep(400);

  const captions = [...t.prose().querySelectorAll('.markdown-table-block .markdown-caption')].map(
    (caption) => caption.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  );
  check(
    'caption-only, ID-only, and captioned tables use the document label and prefix',
    captions.filter((caption) => caption.startsWith('Data table 2-')),
    [
      'Data table 2-1. A caption-only table',
      'Data table 2-2.',
      'Data table 2-3. Results'
    ]
  );

  const automatic = t.prose().querySelector('[data-auto-reference="tbl:results"]');
  const manual = t.prose().querySelector(
    'a.markdown-link[href="#tbl:results"]:not([data-auto-reference])'
  );
  check(
    'automatic and manual references name the same numbered table',
    [automatic?.textContent ?? null, manual?.textContent ?? null],
    ['Data table 2-3', 'the results table']
  );

  const target = t.prose().querySelector('[id="tbl:results"]');
  const idOnly = t.prose().querySelector('[id="tbl:target"]');
  check(
    'explicit table IDs reach the editor DOM',
    [target !== null, idOnly !== null],
    [true, true]
  );
  check(
    'template classes are preserved in source but not applied to the editor',
    target?.classList.contains('margin') ?? true,
    false
  );

  const before = location.hash;
  const cancelled = automatic ? commandClick(automatic) : true;
  await t.sleep(300);
  const cell = target?.querySelector('[data-table-cell="0:0"]')?.getBoundingClientRect() ?? null;
  const caret = t.caretRect();
  check('command-click is handled by the editor', cancelled, false);
  check('the document hash stays unchanged', location.hash, before);
  check(
    'command-click lands in the table’s first header cell',
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
