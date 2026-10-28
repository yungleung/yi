/**
 * A rebuilt table block never paints the caret on a stale line.
 *
 * Undoing a caption edit rebuilds the table and caption. WebKit lays the table
 * out over more than one frame, so measuring the rebuilt caret on the first
 * frame put it where the table had started — visibly one row above the caption
 * — before the next frame moved it back. The document offset stayed correct;
 * only the drawn line jumped.
 *
 * @covers src/ui/markdown/caret/span.ts
 */
(async () => {
  const t = window.__t;
  const caret = await t.app('/src/ui/markdown/caret/caret.ts');
  const offsets = await t.app('/src/ui/markdown/caret/offsets.ts');
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const press = (key, metaKey = false) =>
    t.scroller().dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        metaKey,
        bubbles: true,
        cancelable: true
      })
    );
  const source = () => t.prose().querySelector('.markdown-caption-source');
  const visible = () => {
    const range = caret.getCaretRange();
    const element = source();
    const drawn = document.querySelector('.markdown-caret')?.getBoundingClientRect() ?? null;
    return {
      offset:
        range && element
          ? offsets.sourceTextOffset(element, range.startContainer, range.startOffset)
          : null,
      top: drawn?.top ?? null
    };
  };

  await t.useLayout('page');
  await t.load(
    '| A | B |\n' +
      '| --- | --- |\n' +
      '| 1 | 2 |\n\n' +
      ': Results {#tbl:results .margin owner=demo}\n\n' +
      'After.\n'
  );
  await t.click(t.prose().querySelector('.markdown-caption-number'), 0.5);
  await t.sleep(250);

  // Put the caret after the closing attribute brace at the caption's end.
  const element = source();
  const text = t.textNodesIn(element)[0];
  const glyph = document.createRange();
  glyph.setStart(text, text.data.length - 1);
  glyph.setEnd(text, text.data.length);
  const box = glyph.getBoundingClientRect();
  const at = {
    bubbles: true,
    cancelable: true,
    clientX: box.right - 0.5,
    clientY: box.top + box.height / 2
  };
  text.parentElement.dispatchEvent(new PointerEvent('pointerdown', at));
  text.parentElement.dispatchEvent(new PointerEvent('pointerup', at));
  text.parentElement.dispatchEvent(new MouseEvent('click', at));
  await t.sleep(250);

  const original = visible();
  press('Backspace');
  await t.sleep(350);
  const beforeUndo = visible();
  press('z', true);

  const frames = [];
  for (let frame = 0; frame < 6; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    frames.push(visible());
  }
  await t.sleep(150);
  const settled = visible();

  check('undo keeps the caret in the caption source', settled.offset, original.offset);
  check(
    'the rebuilt caption settles on its original line',
    settled.top !== null &&
      beforeUndo.top !== null &&
      Math.abs(settled.top - beforeUndo.top) <= 1,
    true
  );
  check(
    'no visible frame paints the caret on a stale line',
    frames.every(
      (frame) => frame.top === null || Math.abs(frame.top - beforeUndo.top) <= 2
    ),
    true
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
