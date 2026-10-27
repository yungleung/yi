/**
 * A prose burst stays in the text node the caret is in, even when a character
 * could later change Markdown parsing.
 *
 * The document and caret update synchronously for every printable key; only the
 * parse and rendered shape wait for the burst to settle. This is what keeps a
 * capital, an underscore, or the next characters of a word from being lost
 * while the block is rebuilt.
 *
 * @covers src/ui/markdown/editing/context.ts,
 *   src/ui/markdown/editing/typed_text.ts,
 *   src/ui/markdown/syntax/plain_edit.ts
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
  const textNodeAtCaret = () => {
    const range = caret.getCaretRange();
    return range?.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer
      : null;
  };

  await t.load('Alpha beta\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(250);
  const block = t.blocks()[0];
  const text = textNodeAtCaret();
  let blockSurvived = true;
  let textNodeSurvived = true;
  const visibleAfterEachKey = [];
  const typed = 'Quick_BrownFast';

  for (let index = 0; index < typed.length; index += 1) {
    press(typed[index]);
    await t.sleep(0);
    blockSurvived &&= t.blocks()[0] === block;
    const current = textNodeAtCaret();
    textNodeSurvived &&= current === text;
    visibleAfterEachKey.push(current?.data ?? null);
  }
  await t.sleep(250);

  check('the paragraph keeps its mounted block through the burst', blockSurvived, true);
  check('and the caret keeps its text node', textNodeSurvived, true);
  check(
    'every character appears immediately with its case intact',
    visibleAfterEachKey,
    Array.from({ length: typed.length }, (_, index) => `Alpha beta${typed.slice(0, index + 1)}`)
  );
  check(
    'the settled document receives the complete burst',
    await t.raw(),
    'Alpha betaQuick_BrownFast\n'
  );
  check(
    'the caret finishes after the last character',
    caret.getCaretRange()?.startOffset,
    'Alpha betaQuick_BrownFast'.length
  );

  await t.load('Start \n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(250);
  for (const character of '_word_') {
    press(character);
    await t.sleep(0);
  }
  await t.sleep(300);
  check(
    'the deferred parse renders the completed syntax',
    t.prose().querySelector('em')?.textContent ?? null,
    'word'
  );
  check('with the source intact', await t.raw(), 'Start _word_\n');

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
