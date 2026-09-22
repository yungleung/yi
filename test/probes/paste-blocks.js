/**
 * Copying several paragraphs and pasting them: the pasted blocks land as blocks
 * wherever they are put — at the start of a paragraph, in the middle of one, at
 * its end, and on an empty line.
 *
 * The last assertion in each case is the other half of the question: an edit
 * rebuilds the blocks it touched and leaves the rest of the DOM alone
 * (`virtual_block_renderer.ts: renderChanged`), which is what "incremental
 * rendering" means here. It is checked by element identity, not by a stopwatch.
 *
 * @covers src/ui/markdown/editing/clipboard.ts, src/ui/markdown/editing/blank_lines.ts
 */
(async () => {
  const t = window.__t;
  /** A paragraph, two paragraphs to copy into it, and a last block to watch. */
  const target = 'alpha\n\nAlpha beta\n\n\ngamma\n\nomega\n';
  const checks = {};
  const failed = [];

  /** Selects raw text by dragging over rendered blocks, and copies it. */
  const copy = async (fromText, toText) => {
    await t.load(`${fromText}\n\n${toText}\n`);
    const start = t.textNodesIn(t.blocks()[0])[0];
    const end = t.textNodesIn(t.blocks()[1]).pop();
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(start, 0);
    range.setEnd(end, end.data.length);
    selection.removeAllRanges();
    selection.addRange(range);
    const data = new DataTransfer();
    t.scroller().dispatchEvent(
      new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true })
    );
    await t.sleep(150);
    return data;
  };

  /** Puts the caret `inside` characters into the text node holding `needle`. */
  const caretAt = async (needle, inside) => {
    const block = t.blocks().find((element) => element.textContent.includes(needle));
    const node = t.textNodesIn(block).find((candidate) => candidate.data.includes(needle));
    const range = document.createRange();
    range.setStart(node, node.data.indexOf(needle) + inside);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: rect.left,
        clientY: rect.top + rect.height / 2
      })
    );
    await t.sleep(120);
  };

  /** Pastes `data`, and reports the document and what happened to the DOM. */
  const paste = async (data, expected, name, watched = 'omega') => {
    const before = t.blocks().find((element) => element.textContent.trim() === watched);
    t.scroller().dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    );
    await t.sleep(250);
    const after = t.blocks().find((element) => element.textContent.trim() === watched);
    const shown = {
      written: data.getData('text/plain'),
      raw: await t.raw(),
      caret: t.caretRect(),
      untouchedBlockKeptItsElement: before !== undefined && after === before,
      blocks: t.blocks().map((element) => element.textContent.trim().slice(0, 12))
    };
    checks[name] = { ...shown, expected, kept: true };
    if (shown.raw !== expected || shown.untouchedBlockKeptItsElement !== true) {
      failed.push(name);
    }
  };

  const clipboard = await copy('one', 'two');

  await t.load(target);
  await caretAt('Alpha beta', 0);
  await paste(clipboard, 'alpha\n\none\n\ntwo\n\nAlpha beta\n\n\ngamma\n\nomega\n', 'atTheStart');

  await t.load(target);
  await caretAt('Alpha beta', 'Al'.length);
  await paste(clipboard, 'alpha\n\nAl\n\none\n\ntwo\n\npha beta\n\n\ngamma\n\nomega\n', 'inTheMiddle');

  await t.load(target);
  await caretAt('Alpha beta', 'Alpha beta'.length);
  await paste(clipboard, 'alpha\n\nAlpha beta\n\none\n\ntwo\n\n\ngamma\n\nomega\n', 'atTheEnd');

  await t.load(target);
  const empty = t.blocks().find((block) => block.textContent.trim() === '');
  await t.click(empty, 0.5);
  await paste(clipboard, 'alpha\n\nAlpha beta\n\none\n\ntwo\n\ngamma\n\nomega\n', 'onAnEmptyLine');

  // A paste that carries no paragraph break is spliced where the caret is.
  const word = new DataTransfer();
  word.setData('text/plain', 'X');
  await t.load('Alpha beta\n\ngamma\n');
  await caretAt('Alpha', 3);
  await paste(word, 'AlpXha beta\n\ngamma\n', 'midWord', 'gamma');

  // Two blocks pasted are one edit: one undo takes the whole paste back.
  await t.load(target);
  await caretAt('Alpha beta', 'Al'.length);
  await paste(clipboard, 'alpha\n\nAl\n\none\n\ntwo\n\npha beta\n\n\ngamma\n\nomega\n', 'oneStep');
  await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'undo' });
  await t.sleep(250);
  const undone = await t.raw();
  checks.undoAfterAPaste = { raw: undone, expected: target };
  if (undone !== target) {
    failed.push('undoAfterAPaste');
  }

  return { checks, failed };
})()
