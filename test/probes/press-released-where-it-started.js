/**
 * A press released where it started is forgotten, so the click that follows is a caret.
 *
 * The editor keeps where the pointer went down, to tell a click from the drag its click may be
 * ending (`editing/pointer.ts: endedADrag` — a gesture that travelled a few pixels *and* left a
 * selection asks for no caret). A markdown node answers the click that lands on it and stops it,
 * so a press whose click a node took is never read by that rule, and it used to lie in wait for
 * the next click that did reach the page. Measured, with the document selected: a bare click
 * placed the caret, and the same click with one such press standing did not — which is what
 * `insert-link.js` lost its last check to inside a whole suite (`test/README.md`, "a click is a
 * gesture").
 *
 * A gesture released where it went down travelled nowhere and cannot have been a drag, so its
 * press is forgotten. The probe holds both sides: the same click with no press (where it lands),
 * and with a press the node's own click left standing (it must land in the same place).
 *
 * @covers src/ui/markdown/editing/pointer.ts, src/ui/markdown/click_routing.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  const line = () => t.textNodesIn(t.blocks()[0])[0];
  const caret = () => {
    const range = caretModule.getCaretRange();
    return range ? { offset: range.startOffset, text: range.startContainer.textContent } : null;
  };
  /** Puts the caret through the app's own caret, without a click: a click reads the press. */
  const placeCaret = (offset) => {
    const range = document.createRange();
    range.setStart(line(), offset);
    range.collapse(true);
    caretModule.setCaretRange(range);
  };
  /** Leaves the document selected, the way Select All or a drag across it does. */
  const selectTheDocument = async () => {
    const range = document.createRange();
    range.selectNodeContents(t.prose());
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    await t.sleep(120);
  };
  /** A click on the page itself, where the editor answers by placing a caret. */
  const clickThePage = async () => {
    const block = t.blocks()[0];
    const rect = block.getBoundingClientRect();
    block.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width * 0.02,
        clientY: rect.top + rect.height / 2
      })
    );
    await t.sleep(200);
  };
  /** The reader's gesture on the block's own node: press, release, and the click it ends. */
  const gestureOnTheNode = async () => {
    const node = t.blocks()[0].querySelector('.markdown-node');
    const rect = node.getBoundingClientRect();
    const at = { bubbles: true, clientX: rect.left + 4, clientY: rect.top + rect.height / 2 };
    node.dispatchEvent(new PointerEvent('pointerdown', at));
    node.dispatchEvent(new PointerEvent('pointerup', at));
    node.dispatchEvent(new MouseEvent('click', { ...at, cancelable: true }));
    await t.sleep(150);
  };

  // Where the click lands with nothing standing: the reader's own click over a selection.
  await t.load('Body text here.\n');
  await t.sleep(250);
  placeCaret(2);
  await selectTheDocument();
  await clickThePage();
  const without = caret();
  check(
    'a click with the document selected places the caret',
    without !== null && without.offset !== 2,
    { from: 2, to: without }
  );

  // And the same click after a gesture the node answered — the press it left must not judge it.
  await t.load('Body text here.\n');
  await t.sleep(250);
  placeCaret(2);
  await gestureOnTheNode();
  check(
    'the node`s own click placed the caret in the line, as a reader`s click does',
    caret()?.text === 'Body text here.',
    caret()
  );
  await selectTheDocument();
  await clickThePage();
  const after = caret();
  check(
    'and a click after that gesture lands where the same click landed without it',
    after !== null && after.offset === without?.offset,
    { without, after }
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
