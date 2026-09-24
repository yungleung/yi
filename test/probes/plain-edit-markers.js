/**
 * The punctuation a plain edit accepts, where a *marker* is waiting for it.
 *
 * A full stop and a comma are written into the text node like a letter, but not
 * everywhere: `1 x` is prose and `1. x` is a list, so the same keystroke that writes
 * without rendering one character to the left must rebuild the block one character
 * later. The same is true of the `.` that would make a run an autolink (`see wwwx` →
 * `see www.x`), refused for the same reason: the link it would make is a node, and its
 * extent is not something a write into one text node can see.
 *
 * The contrast is the marker that is already there: a caret at the start of a list
 * item's *text* is in the content, not in the marker, and a letter typed there is
 * written the way any other letter is.
 *
 * @covers src/ui/markdown/syntax/plain_edit.ts, src/ui/markdown/editing/context.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  /**
   * Loads `text`, puts the caret at `at` — an offset in the *rendered* text of the block
   * holding `needle` — and types `keys`, reporting whether that block survived (the fast
   * path) and what the document holds. The document is read through the clipboard, so it
   * is only read at the end.
   */
  const typeAt = async (text, needle, at, keys) => {
    await t.load(text);
    const block = t.blocks().find((element) => element.textContent.includes(needle));
    const node = block ? t.textNodesIn(block)[0] : null;
    if (!node) {
      return { error: 'no text to put the caret in' };
    }
    const caret = document.createRange();
    caret.setStart(node, at);
    caret.collapse(true);
    const box = caret.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left,
        clientY: box.top + box.height / 2
      })
    );
    await t.sleep(150);
    const before = t.prose().querySelector('.markdown-caret') !== null;
    for (const key of keys) {
      t.key(key);
    }
    await t.sleep(250);
    const after = t.blocks().find((element) => Number(element.dataset.lineStart) === 0) ?? null;
    return {
      caretPlaced: before,
      blockSurvived: after === block,
      document: await t.raw()
    };
  };

  // A full stop where an ordered list's marker is waiting for it: the rule refuses, the
  // block is rendered again, and the document is a list — which is why it refused.
  const list = await typeAt('1 x\n\nsecond\n', '1 x', 1, ['.']);
  check('the caret went into the first block', list.caretPlaced === true, list.caretPlaced);
  check('a full stop in a list marker rebuilds the block', list.blockSurvived === false, list.blockSurvived);
  check('and the line becomes a list', list.document === '1. x\n\nsecond\n', list.document);

  // A full stop that would finish a `www.` autolink: the run the edit is in is the
  // rule's business because the link's extent is a node.
  const autolink = await typeAt('see wwwx now\n', 'wwwx', 7, ['.']);
  check('a full stop inside a www run rebuilds the block', autolink.blockSurvived === false, autolink.blockSurvived);
  check('and the character reaches the document', autolink.document === 'see www.x now\n', autolink.document);

  // A Backspace inside a line that could become a setext underline: the line below a
  // paragraph made of `-` is a heading's underline, so the deletion is not plain.
  // (The two lines are one paragraph, so the caret after the `x` is offset 8 of its
  // rendered text, `title\n-x-`.)
  const setext = await typeAt('title\n-x-\n', 'title', 8, ['Backspace']);
  check('a Backspace that would leave an underline rebuilds the block', setext.blockSurvived === false, setext.blockSurvived);
  check('and the character leaves the document', setext.document === 'title\n--\n', setext.document);

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
