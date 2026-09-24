/**
 * What one undo takes back, and where the caret is afterwards.
 *
 * Two cases. A word of typing is one step, so "hello world" is two undos and the
 * first one takes the word it just typed plus no more. And a step is a step *in the
 * document*: undo puts the caret back where the typing began rather than where the
 * reader left it, which the second case checks the only way a caret can be checked —
 * by typing a letter afterwards and reading where it landed.
 *
 * @covers src/ui/markdown/document/history.ts, src/ui/markdown/document/state.ts,
 *   src/ui/markdown/markdown_editor.ts
 */
(async () => {
  const t = window.__t;
  const out = t.report({});
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  /** Undo, the way the menu and the keymap ask for it. */
  const undo = async () => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'undo' });
    await t.sleep(250);
  };
  /** Puts the caret inside `needle`, `inside` characters in. */
  const caretAt = async (needle, inside) => {
    const block = t.blocks()[0];
    const node = t.textNodesIn(block).find((leaf) => leaf.data.includes(needle));
    const range = document.createRange();
    range.setStart(node, node.data.indexOf(needle) + inside);
    range.collapse(true);
    const box = range.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left,
        clientY: box.top + box.height / 2
      })
    );
    await t.sleep(150);
  };

  await t.load('one two\n');
  await caretAt('one', 3);
  for (const key of ['h', 'e', 'l', 'l', 'o', ' ', 'w', 'o', 'r', 'l', 'd']) {
    t.key(key);
  }
  await t.sleep(300);
  out.typed = await t.raw();
  check('the letters reach the document', out.typed === 'onehello world two\n', out.typed);
  await undo();
  out.afterOneUndo = await t.raw();
  check('one undo takes the word back, not the word before it',
    // The typed run was "hello world"; undo takes "world" back and leaves the space
    // the author typed, next to the space the document already had.
    out.afterOneUndo === 'onehello  two\n', out.afterOneUndo);
  await undo();
  out.afterTwoUndos = await t.raw();
  check('and the step before that is the word and its space',
    out.afterTwoUndos === 'one two\n', out.afterTwoUndos);

  await t.load('A paragraph with fairly plain words in it.\n\nsecond\n');
  await caretAt('fairly', 3);
  t.key('x');
  await t.sleep(250);
  // The reader leaves — the caret is somewhere else entirely now.
  await caretAt('words', 2);
  await undo();
  t.key('y');
  await t.sleep(250);
  out.caretAfterUndo = await t.raw();
  check(
    'undo puts the caret back where the typing was',
    out.caretAfterUndo === 'A paragraph with faiyrly plain words in it.\n\nsecond\n',
    out.caretAfterUndo
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
