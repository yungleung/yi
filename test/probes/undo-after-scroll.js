/**
 * Undo of an edit whose block has left the window.
 *
 * History and virtualisation each have their own tests; this is the seam. The
 * edit is made near the top, the reader scrolls to the bottom so that block
 * unmounts, and the undo is then asked to put the document back — through the
 * same `updateText` path the document uses, with a log of edits rather than a
 * snapshot to restore.
 *
 * @covers src/ui/markdown/document/history.ts, src/ui/markdown/document/state.ts
 */
(async () => {
  const t = window.__t;
  const doc = `${Array.from({ length: 200 }, (_, index) => `paragraph ${index} text`).join('\n\n')}\n`;
  const checks = [];
  const check = (name, actual, expected) => checks.push({ name, actual, expected });

  await t.load(doc);
  check('the document starts whole', (await t.raw()) === doc, true);

  // Type at the end of the second paragraph, then leave it behind.
  await t.click(t.textNodesIn(t.blocks()[1]).pop().parentElement, 0.99);
  t.key('X');
  await t.sleep(250);
  check(
    'the keystroke landed where the caret was',
    (await t.raw()).startsWith('paragraph 0 text\n\nparagraph 1 textX\n'),
    true
  );

  t.scroller().scrollTop = 100000;
  await t.sleep(500);
  const mountedAtTheBottom = t.blocks().length;
  check(
    'scrolled to the bottom, the edited block is gone',
    t.blocks().some((block) => block.textContent.includes('paragraph 1 textX')),
    false
  );

  await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'undo' });
  await t.sleep(400);
  const afterUndo = await t.raw();
  const mountedAfterUndo = t.blocks().length;
  check('the undo put the document back', afterUndo === doc, true);
  check('and did not mount the document to do it', mountedAfterUndo <= mountedAtTheBottom + 4, true);

  return {
    checks,
    failed: checks.filter((entry) => entry.actual !== entry.expected).map((entry) => entry.name),
    mountedAtTheBottom,
    mountedAfterUndo,
    blocksInTheDocument: 200,
    caretAfterUndo: t.caretRect()
  };
})()
