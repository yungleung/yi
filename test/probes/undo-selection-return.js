/**
 * What an undo gives back: a caret, or the selection an edit replaced.
 *
 * Select a word, type over it, undo — the word is back *and selected*, so it can be
 * typed over again instead of having to be selected a second time. That is the whole
 * point of an edit remembering its author as a mark rather than an offset. The contrast
 * is an edit the author made with a caret: undoing a Backspace restores the character
 * and leaves a caret, not a selection.
 *
 * The selection is read before the document is, because reading the document is a
 * Select All and a copy (`t.raw`), which clears it. A selection that spans two blocks
 * is `undo-selection-across-blocks.js`: this probe is the single-block cases, and the
 * two are apart so each answers inside the bridge's five-second budget.
 *
 * @covers src/ui/markdown/document/history.ts, src/ui/markdown/editing/context.ts,
 *   src/ui/markdown/markdown_editor.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  /** Undo, the way the menu and the keymap ask for it. */
  const undo = async () => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'undo' });
    await t.sleep(300);
  };
  const type = async (text) => {
    for (const key of text) {
      t.key(key);
    }
    await t.sleep(250);
  };
  /** The rendered text of the browser's selection, and whether it is a selection at all. */
  const selectionNow = () => {
    const selection = window.getSelection();
    return {
      text: selection ? selection.toString() : null,
      collapsed: selection ? selection.isCollapsed : null
    };
  };
  /** Selects a document range rendered in one block, the way a drag does. */
  const select = async (needle, from, to) => {
    const node = t.textNodesIn(t.blocks()[0]).find((leaf) => leaf.data.includes(needle));
    const start = node.data.indexOf(needle) + from;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + (to - from));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    await t.sleep(150);
  };
  /** Puts a collapsed caret inside `needle`, `inside` characters in. */
  const caretAt = async (needle, inside) => {
    const node = t.textNodesIn(t.blocks()[0]).find((leaf) => leaf.data.includes(needle));
    const range = document.createRange();
    range.setStart(node, node.data.indexOf(needle) + inside);
    range.collapse(true);
    caretModule.showCaret(range);
    t.prose().focus({ preventScroll: true });
    await t.sleep(150);
  };

  // Type over a selection: the run replaces it, and the undo gives it back selected.
  await t.load('hello world\n');
  await select('world', 0, 5);
  check('the word is selected first', selectionNow().text === 'world', selectionNow());
  await type('there');
  const typed = await t.raw();
  check('typing replaces the selection', typed === 'hello there\n', typed);
  await undo();
  const restored = selectionNow();
  const text = await t.raw();
  check('undo puts the document back', text === 'hello world\n', text);
  check(
    'and the word it replaced comes back selected',
    restored.text === 'world' && restored.collapsed === false,
    restored
  );

  // An edit the author made with a caret gives a caret back, not a selection.
  await t.load('hello world\n');
  await caretAt('world', 5);
  t.key('Backspace');
  await t.sleep(250);
  const deleted = await t.raw();
  check('a backspace removes the character before the caret', deleted === 'hello worl\n', deleted);
  await undo();
  const after = selectionNow();
  const back = await t.raw();
  check('undo restores the character', back === 'hello world\n', back);
  check(
    'and leaves a caret, because that is what the author had',
    after.collapsed === true,
    after
  );

  // A whole-document command remembers its author too. Bold computes the whole text and
  // records one edit with no marks without this phase, so its undo left a caret wherever
  // the reader was instead of the word that was formatted.
  await t.load('hello world\n');
  await select('world', 0, 5);
  const bold = [...document.querySelectorAll('button')].find(
    (element) => element.getAttribute('aria-label') === 'Bold'
  );
  check(
    'Bold is available through custom chrome or the native menu command',
    bold !== undefined || t.platform() !== 'macos',
    Boolean(bold)
  );
  await t.toolbarAction('Bold');
  {
    const bolded = await t.raw();
    check('bold wraps the word', bolded === 'hello **world**\n', bolded);
    await undo();
    const restored = selectionNow();
    const text = await t.raw();
    check('undo puts the text back', text === 'hello world\n', text);
    check(
      'and the word it formatted is selected again',
      restored.text === 'world' && restored.collapsed === false,
      restored
    );
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
