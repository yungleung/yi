/**
 * A page-wide rebuild leaves the caret where the reader put it.
 *
 * The renderer builds every mounted block again when its inputs change — the bibliography arrives,
 * a setting is saved (the app refreshes the editor on `config_changed`: `src/main.ts`), the page is
 * drawn at a new scale. The reader's caret is a live DOM range, and removing the element it sits in
 * relocates that range to the point the element occupied: connected, between two blocks, naming no
 * document offset (`markdown_editor.ts: reanchorCaret`). So the rebuild may only touch the DOM once
 * the caret has been captured (`virtual_block_renderer.ts: refresh`, and the sync hooks' own
 * contract) — and the next keystroke is what proves it, because a caret whose offset was lost maps
 * to the whole document (`editing/selection.ts: rangeOffsets`) and the letter replaces the note.
 *
 * Measured before the fix, a letter typed after `config_changed`: `"Y"`, where the note's own words
 * and the `X` typed before the rebuild should have been.
 *
 * @covers src/ui/markdown/virtual_block_renderer.ts, src/ui/markdown/editing/selection.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });

  await t.load('one\n\ntwo\n');
  const first = t.prose().querySelector('.markdown-block');
  await t.click(first, 0.99, 0.5);
  await t.sleep(200);
  // The letter first: it is what puts the caret in the text node it wrote into, which is the
  // position a rebuild has to keep.
  t.key('X');
  await t.sleep(200);
  check('the letter lands where the click left the caret', await t.raw(), 'oneX\n\ntwo\n');

  // Every setting the reader saves is announced, and the editor builds the page again for it. The
  // rebuild is waited for by watching the element it replaces, so the probe does not depend on how
  // long the announcement takes to arrive.
  await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'config_changed' });
  let rebuilt = false;
  for (let attempt = 0; attempt < 60 && !rebuilt; attempt += 1) {
    await t.sleep(50);
    rebuilt = !first.isConnected;
  }
  check('a setting builds the page again', rebuilt, true);

  t.key('Y');
  await t.sleep(200);
  check('the caret is still in the note it was in', await t.raw(), 'oneXY\n\ntwo\n');

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
