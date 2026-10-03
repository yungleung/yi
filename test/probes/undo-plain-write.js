/**
 * Undoing a plain write leaves the page showing what the document says — for a committed
 * word, and for an ordinary keystroke, which take the same path.
 *
 * A committed word lands by the plain-keystroke path — a write into the text node the caret
 * is in, with no rebuild — and an undo then puts the *old* text back. If the renderer still
 * believes its element was built from that old text (it was, before the write), it sees
 * nothing to re-render and leaves the committed character on screen: the document is right,
 * the page is stale, and save-on-a-keystroke writes the right bytes while the reader looks at
 * a ghost. That is what a reader reported from the first line of the demo document, undone
 * with ⌘Z.
 *
 * @covers src/ui/markdown/virtual_block_renderer.ts, src/ui/markdown/editing/typed_text.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const seam = () => document.querySelector('.markdown-composition-input');
  const rendered = () => t.blocks().map((element) => element.textContent);

  await t.load('This paragraph has *italic* text.\n');
  await t.sleep(200);
  // The caret inside the word, where a committed character is a plain write.
  const block = t.blocks()[0];
  const node = t.textNodesIn(block).find((leaf) => leaf.data.includes('paragraph'));
  const at = node.data.indexOf('paragraph') + 4;
  const range = document.createRange();
  range.setStart(node, at);
  range.collapse(true);
  const box = range.getBoundingClientRect();
  node.parentElement.dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: box.left, clientY: box.top + box.height / 2 })
  );
  await t.sleep(200);
  const before = await t.raw();
  const beforeRendered = rendered();

  // A word the system commits, the way the seam receives one.
  const area = seam();
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  area.value = '你';
  area.dispatchEvent(new CompositionEvent('compositionend', { data: '你', bubbles: true }));
  await t.sleep(300);
  check('the word lands in the document', (await t.raw()).includes('你'), true);
  check('and on the page', rendered()[0]?.includes('你') ?? false, true);

  await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'undo' });
  await t.sleep(400);
  check('the undo takes the word out of the document', await t.raw(), before);
  check('and off the page with it', rendered(), beforeRendered);

  // The same staleness without any input method: a plain keystroke is written the same way.
  t.key('x');
  await t.sleep(250);
  await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'undo' });
  await t.sleep(400);
  check('and a typed letter goes off the page with its undo', rendered(), beforeRendered);

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
