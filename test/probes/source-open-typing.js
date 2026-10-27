/**
 * A source reveal keeps the caret it places while the reader types immediately.
 *
 * The first click rebuilds the paragraph into the node's Markdown source. Keys
 * typed before the deferred caret paint must still use the source caret that was
 * placed synchronously, and must not move to the block end or replace anything.
 *
 * @covers src/ui/markdown/editing/context.ts,
 *   src/ui/markdown/nodes/revealable_node.ts,
 *   src/ui/markdown/source_mode.ts
 */
(async () => {
  const t = window.__t;
  const caret = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const press = (character) =>
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', {
        key: character,
        bubbles: true,
        cancelable: true
      })
    );

  await t.load('Before [title](https://example.com) after\n');
  const opening = t.click(t.prose().querySelector('a.markdown-link'), 0.72, 0.5);
  for (const character of 'abc') {
    press(character);
  }
  await opening;
  await t.sleep(250);

  const range = caret.getCaretRange();
  check(
    'the caret stays in the revealed source',
    {
      inSource:
        range?.startContainer.parentElement?.closest('.markdown-link-source') !== null,
      offset: range?.startOffset ?? null
    },
    { inSource: true, offset: 9 }
  );
  check(
    'and the burst stays at that editing position',
    await t.raw(),
    'Before [titleabc](https://example.com) after\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
