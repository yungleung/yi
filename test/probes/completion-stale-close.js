/**
 * Closing a wikilink source wins over a completion lookup that answers later.
 *
 * A Backspace inside a wikilink refreshes its document choices. The workspace lookup is a
 * promise, so moving the caret away before it answers is one more fact the old query must not
 * undo: its late `offer` restores the query caret and reopens the source the reader just left.
 *
 * @covers src/ui/markdown/editing/completions.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const wikilink = () => t.prose().querySelector('.markdown-wikilink');
  const source = () => t.prose().querySelector('.markdown-wikilink-source');
  const away = () => [...t.prose().querySelectorAll('.markdown-block')].pop();
  const emit = async (name) => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: name });
    await t.sleep(250);
  };

  await t.load('Before [[Target]] after.\n\nEnd.\n');
  await t.click(wikilink(), 0.5);
  t.key('Backspace');
  await t.sleep(250);
  await emit('undo');
  await t.click(away(), 0.5);
  await t.sleep(1000);

  const end = away();
  const range = caretModule.getCaretRange();
  const caretBlock =
    range?.startContainer.parentElement?.closest('.markdown-block')?.dataset.lineStart ?? null;
  check('the source stays closed after its lookup answers', source(), null);
  check('and the wikilink renders again', wikilink()?.textContent ?? null, 'Target');
  check(
    'with the caret still in the block clicked',
    caretBlock,
    end.dataset.lineStart
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
