/**
 * Automatic references infer heading text, reveal source, and navigate.
 *
 * @covers src/ui/markdown/nodes/auto_reference.ts,
 *   src/ui/markdown/document/reference_index.ts,
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

  await t.load('# Model\n\nSee [#model].\n');
  const reference = t.prose().querySelector('[data-auto-reference]');
  check('the reference renders as a link', reference?.tagName ?? null, 'A');
  check('with the target title inferred', reference?.textContent ?? null, 'Model');
  check('and the fragment it names', reference?.getAttribute('href') ?? null, '#model');

  await t.click(reference, 0.5);
  await t.sleep(250);
  check(
    'a plain click reveals its source',
    t.prose().querySelector('.markdown-auto-reference-source')?.textContent ?? null,
    '[#model]'
  );

  await t.load('# Destination\n\nSee [#destination].\n');
  const hashBefore = location.hash;
  const cancelled = commandClick(t.prose().querySelector('[data-auto-reference]'));
  await t.sleep(300);
  const heading = t.prose().querySelector('h1');
  const caret = t.caretRect();
  const box = heading?.getBoundingClientRect() ?? null;
  check('command-click is handled by the editor', cancelled, false);
  check('the webview hash stays unchanged', location.hash, hashBefore);
  check(
    'the caret reaches the target heading',
    caret !== null && box !== null && caret.y >= box.top - 6 && caret.y <= box.bottom + 6,
    true
  );

  await t.load('See [#missing].\n');
  const missing = t.prose().querySelector('[data-auto-reference]');
  check('an unknown target is visibly unresolved', missing?.classList.contains('markdown-auto-reference-unresolved'), true);
  check('and keeps the ID as its fallback text', missing?.textContent ?? null, '#missing');

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
