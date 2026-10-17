/**
 * What an undo gives back when the selection it replaced spans two blocks.
 *
 * A drag can select past the end of a paragraph. Typing over that range replaces both
 * blocks with one, and undo puts both back *and* selects the range again, so the reader
 * can type over it a second time rather than selecting it again by hand. The range's two
 * ends are read before the document is, because reading the document is a Select All and
 * a copy (`t.raw`), which clears it.
 *
 * This is the cross-block half of `undo-selection-return.js`: one probe, one answer
 * inside the bridge's five-second budget.
 *
 * @covers src/ui/markdown/document/history.ts, src/ui/markdown/editing/context.ts,
 *   src/ui/markdown/markdown_editor.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
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
  /** The two ends of the browser's selection, and whether it is a selection at all. */
  const selectionEnds = () => {
    const selection = window.getSelection();
    return {
      collapsed: selection ? selection.isCollapsed : null,
      anchor: selection?.anchorNode?.data ?? null,
      anchorOffset: selection?.anchorOffset ?? null,
      focus: selection?.focusNode?.data ?? null,
      focusOffset: selection?.focusOffset ?? null
    };
  };

  await t.load('alpha\n\nbeta\n');
  const startNode = t.textNodesIn(t.blocks()[0]).find((leaf) => leaf.data.includes('alpha'));
  const endNode = t.textNodesIn(t.blocks()[1]).find((leaf) => leaf.data.includes('beta'));
  const spanning = document.createRange();
  spanning.setStart(startNode, 2);
  spanning.setEnd(endNode, 2);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(spanning);
  await t.sleep(150);
  const selected = selectionEnds();
  check(
    'the range across two blocks is selected first',
    selected.collapsed === false && selected.anchor === 'alpha' && selected.focus === 'beta',
    selected
  );
  await type('X');
  const replaced = await t.raw();
  check(
    'typing over a selection across two blocks replaces the whole range',
    replaced === 'alXta\n',
    replaced
  );
  await undo();
  const ends = selectionEnds();
  const both = await t.raw();
  check('undo restores both blocks', both === 'alpha\n\nbeta\n', both);
  check(
    'and the selection across them',
    ends.collapsed === false &&
      ends.anchor === 'alpha' &&
      ends.anchorOffset === 2 &&
      ends.focus === 'beta' &&
      ends.focusOffset === 2,
    ends
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
