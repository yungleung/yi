/**
 * A fenced block's source view draws its caret on the line the offset it names is on, and the arrows
 * move it from one of those lines to the next.
 *
 * The two positions that sit right after a newline — the body's first line and the body's end — are
 * where WebKit draws a caret anchored to the *previous* text node at the end of *that* line, a
 * space past its text: stepping right from the opening fence left the caret a space after ` ```ts `,
 * and stepping right from the last line of code left it a space after the code. The offset is the
 * same either way, so only the line the caret is drawn on changes — and typing must still land
 * where the offset says.
 *
 * Stepping back onto such a line is the other half: the position at the *end* of the text node the
 * newline closes is the line the caret is already on, so the left arrow has to land one character
 * in from it, on the line the newline closed.
 *
 * @covers src/ui/markdown/caret/caret.ts, src/ui/markdown/caret/navigation.ts,
 *   src/ui/markdown/caret/dom.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });

  const block = () => t.prose().querySelector('.markdown-block');
  const parts = () => {
    const pre = block()?.firstElementChild ?? null;
    const delimiters = [...(pre?.querySelectorAll('.markdown-fence-delimiter') ?? [])];
    return { pre, opening: delimiters[0] ?? null, body: pre?.querySelector('code') ?? null, closing: delimiters[1] ?? null };
  };
  /** Whether the drawn caret sits on this element's line. */
  const onLine = (element) => {
    const caret = t.caretRect();
    const box = element?.getBoundingClientRect();
    return caret !== null && box !== undefined && Math.abs(caret.y - Math.round(box.top)) <= 6;
  };
  /** The right edge of the text an element holds. */
  const textRight = (element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = [...range.getClientRects()];
    return rects.length === 0 ? null : Math.round(Math.max(...rects.map((rect) => rect.right)));
  };
  /** Whether the caret is at the end of this element's text, on its line. */
  const atEndOf = (element) => {
    const caret = t.caretRect();
    const right = textRight(element);
    return caret !== null && right !== null && Math.abs(caret.x - right) <= 12 && onLine(element);
  };
  /** Whether the caret is at the start of this element's text, on its line. */
  const atStartOf = (element) => {
    const caret = t.caretRect();
    const box = element?.getBoundingClientRect();
    return caret !== null && box !== undefined && Math.abs(caret.x - Math.round(box.left)) <= 10 && onLine(element);
  };
  /** Enters the block's source view and leaves the caret on its opening fence's first character. */
  const intoSource = async () => {
    await t.load('```ts\nlet a = 1;\n```\n');
    await t.sleep(300);
    for (let attempt = 0; attempt < 2 && parts().opening === null; attempt += 1) {
      await t.click(block().firstElementChild, 0.25, 0.5);
      await t.sleep(350);
    }
    await t.click(parts().opening, 0.001, 0.5);
    await t.sleep(300);
  };
  /** Steps the caret right, one character at a time. */
  const stepRight = async (times) => {
    for (let step = 0; step < times; step += 1) {
      t.key('ArrowRight');
      await t.sleep(50);
    }
    await t.sleep(70);
  };
  /** Steps the caret left, one character at a time. */
  const stepLeft = async (times) => {
    for (let step = 0; step < times; step += 1) {
      t.key('ArrowLeft');
      await t.sleep(50);
    }
    await t.sleep(70);
  };

  // Walk the block: every position must be drawn on the line its offset names, and each step of the
  // way back must land on the line above.
  await intoSource();
  await stepRight('```ts'.length);
  check('the caret at the end of the opening fence is at its end', atEndOf(parts().opening), true);
  await stepRight(1);
  check('and a step right draws it at the body’s own start', atStartOf(parts().body), true);
  await stepLeft(1);
  check('and a step left puts it back on the opening fence’s line', atEndOf(parts().opening), true);
  await stepRight(1 + 'let a = 1;'.length);
  check('the caret at the end of the last line of code is at its end', atEndOf(parts().body), true);
  await stepRight(1);
  check('and a step right draws it on the closing fence’s line', onLine(parts().closing), true);
  await stepLeft(1);
  check('and a step left puts it back on the last line of code', atEndOf(parts().body), true);
  t.key('X');
  await t.sleep(250);
  check('where the offset says: typing appends to that line', await t.raw(), '```ts\nlet a = 1;X\n```\n');

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
