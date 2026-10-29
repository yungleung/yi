/**
 * A drag that crosses a block boundary keeps what it selected.
 *
 * The browser fires the click a drag ends with at the nearest common ancestor of where the
 * press and the release landed. Inside one paragraph that ancestor is the node itself, and
 * the node keeps the selection; across two blocks it is the page, which owns no node — the
 * one spot the editor answers by placing a caret (`click_routing.ts: routePointerClick` →
 * `editing/context.ts: placeCaret`), and placing it there drops the native ranges. So a drag
 * from one paragraph into the next left nothing selected while a drag inside one paragraph
 * worked.
 *
 * A probe cannot drive a real drag — a synthetic press does not build a selection the way
 * the platform's does — so it builds the state a drag leaves behind, the cross-block range,
 * and then sends the gesture the browser sends for it: the press, and the click that ends it
 * at the ancestor (see `test/probes/input-method-click.js` for the same four-event shape).
 *
 * @covers src/ui/markdown/editing/pointer.ts, src/ui/markdown/click_routing.ts,
 *   src/ui/markdown/markdown_editor.ts
 */
(async () => {
  const t = window.__t;
  const caret = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });

  await t.load('alpha one\n\nbeta two\n');
  await t.sleep(300);
  const [first, second] = t.blocks();
  const r1 = first.getBoundingClientRect();
  const r2 = second.getBoundingClientRect();
  const press = { clientX: Math.round(r1.left + 2), clientY: Math.round(r1.top + r1.height / 2) };
  const release = { clientX: Math.round(r2.right - 2), clientY: Math.round(r2.top + r2.height / 2) };
  const prose = first.closest('.prose');
  /** The press of a gesture, wherever the pointer went down. */
  const pressAt = (point) =>
    document
      .elementFromPoint(point.clientX, point.clientY)
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, ...point }));
  /** The click a gesture ends with, at the ancestor of its two ends. */
  const clickAt = (point) =>
    prose.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...point }));
  /** The release that ends a gesture, where the browser delivers it. */
  const liftAt = (point) => {
    const over = document.elementFromPoint(point.clientX, point.clientY);
    over.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, ...point }));
    over.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, ...point }));
  };

  // What the drag leaves behind: a range from the press to the release.
  const start = document.caretRangeFromPoint(press.clientX, press.clientY);
  const end = document.caretRangeFromPoint(release.clientX, release.clientY);
  const range = document.createRange();
  range.setStart(start.startContainer, start.startOffset);
  range.setEnd(end.startContainer, end.startOffset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  check('the drag covers both blocks', selection.toString(), 'alpha one\n\nbeta two');
  // The editor's own reading of the selection follows the native one asynchronously
  // (`markdown_editor.ts` listens for `selectionchange`); a real drag takes frames, and the
  // click it ends with arrives after the editor has seen the range.
  await t.sleep(250);
  check('and the editor has read it', caret.getSelectionRange() !== null, true);

  // The gesture: the press where the drag began, then the click the browser fires — at the
  // nearest common ancestor of the two ends, which across blocks is the page itself.
  pressAt(press);
  liftAt(release);
  clickAt(release);
  await t.sleep(250);

  const kept = window.getSelection()?.toString() ?? null;
  check('the selection survives the click that ended the drag', kept, 'alpha one\n\nbeta two');
  check('and the editor still sees it', caret.getSelectionRange() !== null, true);

  // A click that did not move is still a caret: the press is its own.
  pressAt(release);
  liftAt(release);
  clickAt(release);
  await t.sleep(250);
  check('a plain click still collapses what was selected', window.getSelection()?.toString() ?? null, '');
  check('and leaves a caret for the editor', caret.getSelectionRange(), null);
  const drawn = t.caretRect();
  const atTheLine = drawn !== null && Math.abs(drawn.y - r2.top) <= 40;
  check('drawn at the line the click pointed at', atTheLine, true);

  // A press that travelled with nothing selected is still a caret: the movement alone is
  // not a drag, and a margin click the pointer jittered through must still place the caret.
  pressAt(release);
  liftAt(press);
  clickAt(press);
  await t.sleep(250);
  const moved = t.caretRect();
  const atTheFirst = moved !== null && Math.abs(moved.y - r1.top) <= 40;
  check('a press that moved over nothing still places the caret', atTheFirst, true);

  await t.load('alpha one\n\nbeta two\n');
  await t.sleep(200);
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
