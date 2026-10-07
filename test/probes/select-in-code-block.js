/**
 * A selection inside a fenced block survives the caret landing in it.
 *
 * A fenced block is built as its own text — delimiters and all — while the caret is inside it,
 * and `editing/context.ts: showSourceAt` rebuilds the block when that shape changes, which
 * replaces the element holding the selected text. The caret observer asks after every caret move
 * (`markdown_editor.ts: followCaret`), and the click a drag ends with inside one block lands on the
 * block's own node — so the click that ended a drag over code asked for the caret, the answer
 * changed the shape, and the selection went with the element it was drawn on. A selection inside a
 * paragraph ends on a node whose shape cannot change, which is why only the fenced block lost it.
 *
 * A probe cannot drive a real drag, so it builds the state one leaves — the caret in the block
 * (a click, which is what shows the block's own text), a selected range over its first word — and
 * then sends the gesture the browser sends for it: the press, and the click that ends it at the
 * node. The editor reads the native selection asynchronously, so the selection is given the frames
 * a real drag gives it before the click arrives (`test/probes/select-across-blocks.js` does the
 * same for a drag across two blocks).
 *
 * @covers src/ui/markdown/markdown_editor.ts, src/ui/markdown/editing/context.ts
 */
(async () => {
  const t = window.__t;
  const caret = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });

  // A clean start: a selection left live by whatever ran before would have the block keep the
  // shape it has, and the scenario this probe is about would not happen at all.
  window.getSelection()?.removeAllRanges();
  await t.sleep(200);
  await t.load('# Title\n\n```js\nconst alpha = 1;\nconst beta = 2;\n```\n\nAfter.\n');
  await t.sleep(400);

  const findBlock = () => t.blocks().find((block) => block.textContent.includes('alpha'));
  let block = findBlock();
  const point = (fx, fy) => {
    const rect = block.getBoundingClientRect();
    return {
      clientX: Math.round(rect.left + 12 + (rect.width - 40) * fx),
      clientY: Math.round(rect.top + 8 + (rect.height - 24) * fy)
    };
  };
  const fire = (at, type) =>
    document.elementFromPoint(at.clientX, at.clientY).dispatchEvent(
      type === 'click'
        ? new MouseEvent('click', { bubbles: true, cancelable: true, ...at, detail: 1 })
        : new PointerEvent(type, { bubbles: true, cancelable: true, ...at })
    );

  // Into the block: the caret is in it and it shows its own text, delimiters and all.
  const press = point(0.15, 0.25);
  fire(press, 'click');
  await t.sleep(400);
  block = findBlock();
  check('a click in the block shows its own text', block.textContent.includes('```'), true);

  // A drag over the code's first word, as the state it leaves behind.
  const node = t.textNodesIn(block).find((text) => text.data.includes('const'));
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, 5);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  await t.sleep(250);
  check('the drag covers the word', selection.toString(), 'const');
  check('and the editor has read it', caret.getSelectionRange() !== null, true);

  // The click the same-block drag ends with: on the block's own node.
  const release = point(0.55, 0.25);
  fire(press, 'pointerdown');
  fire(release, 'click');
  await t.sleep(300);

  check('the selection survives the click that ended the drag', selection.toString(), 'const');
  check('and the editor still sees it', caret.getSelectionRange() !== null, true);
  check('and the block still shows its own text', (findBlock()?.textContent ?? '').includes('```'), true);

  window.getSelection()?.removeAllRanges();
  await t.load('# Title\n');
  await t.sleep(200);
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
