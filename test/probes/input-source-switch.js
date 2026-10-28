/**
 * A native input-source switch refreshes the focused text seam.
 *
 * macOS may keep WebKit's textarea on the previous input context when the reader
 * changes source. The native notification must clear that context and focus the seam
 * again, or the first Chinese key is delivered as Latin text.
 *
 * @covers src-tauri/src/input_source.rs, src/ui/markdown/editing/composition_input.ts,
 *   src/ui/markdown/markdown_editor.ts
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
  const seam = () => document.querySelector('.markdown-composition-input');

  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);

  let focusouts = 0;
  let focusins = 0;
  seam().addEventListener('focusout', () => {
    focusouts += 1;
  });
  seam().addEventListener('focusin', () => {
    focusins += 1;
  });
  seam().value = 'stale';
  await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {
    event: 'input_source_changed',
    payload: null
  });
  await t.sleep(50);

  check('the source switch clears stale native text', seam().value, '');
  check('the seam refreshes its native input context', [focusouts, focusins], [1, 1]);
  check('and keeps the keyboard', document.activeElement === seam(), true);

  seam().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  seam().value = 'ni';
  seam().dispatchEvent(new CompositionEvent('compositionupdate', { data: 'ni', bubbles: true }));
  seam().value = '你';
  seam().dispatchEvent(new CompositionEvent('compositionend', { data: '你', bubbles: true }));
  await t.sleep(250);
  check('the first Chinese composition starts normally', await t.raw(), 'hello你\n');

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
