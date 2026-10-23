/**
 * A wrapped paragraph's visual line boundaries: stepping left from the start of a later visual line
 * lands the caret at the right edge of the line above, not at the paragraph's start.
 *
 * Soft wraps have no document newline. The position before the first glyph of a wrapped line can
 * name the collapsed space at the previous line's end, for which WebKit returns an empty rectangle.
 * The drawn caret must derive its position from the visible character before that boundary.
 *
 * @covers src/ui/markdown/caret/geometry.ts, src/ui/markdown/caret/navigation.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const caret = await t.app('/src/ui/markdown/caret/caret.ts');

  await t.useLayout('page');
  const text =
    'A long paragraph with enough ordinary words to wrap over several visual lines in the page width, ' +
    'and still keep going so that the second line has a stable beginning and a clear previous line above it.';
  await t.load(`${text}\n`);
  await t.sleep(250);

  const span = t.prose().querySelector('p .markdown-node');
  const node = span.firstChild;
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, node.data.length);
  const lines = [...range.getClientRects()].map((rect) => rect.toJSON());
  check(
    'the paragraph wraps onto at least two visual lines',
    lines.length >= 2,
    lines
  );

  const second = lines[1] ?? null;
  if (second !== null) {
    const at = {
      bubbles: true,
      cancelable: true,
      clientX: second.left + 1,
      clientY: second.top + second.height / 2
    };
    span.dispatchEvent(new PointerEvent('pointerdown', at));
    span.dispatchEvent(new PointerEvent('pointerup', at));
    span.dispatchEvent(new MouseEvent('click', at));
    await t.sleep(180);
  }

  const beforeRange = caret.getCaretRange();
  const before = {
    offset: beforeRange?.startOffset ?? null,
    caret: t.caretRect()
  };
  t.key('ArrowLeft');
  await t.sleep(180);
  const afterRange = caret.getCaretRange();
  const after = {
    offset: afterRange?.startOffset ?? null,
    caret: t.caretRect()
  };

  check(
    'Left from the second visual line moves one character back',
    before.offset !== null && after.offset === before.offset - 1,
    { before: before.offset, after: after.offset }
  );
  check(
    'and the caret is drawn at the right edge of the line above',
    second !== null &&
      after.caret !== null &&
      Math.abs(after.caret.y - Math.round(lines[0].top)) <= 2 &&
      Math.abs(after.caret.x - Math.round(lines[0].right)) <= 2,
    { line: lines[0], caret: after.caret }
  );
  check(
    'the wrapped text is untouched',
    (await t.raw()) === `${text}\n`,
    (await t.raw()).slice(0, 40)
  );

  return {
    lineBefore: before,
    lineAfter: after,
    checks,
    failed: checks.filter((item) => !item.pass).map((item) => item.name)
  };
})()
