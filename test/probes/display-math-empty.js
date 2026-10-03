/**
 * Writing into an empty display formula: the character goes into the content,
 * whichever edge of the empty content the caret was put at.
 *
 * A `$$` line only delimits a formula while it is the fence and nothing else, so a
 * character written onto the opening fence's line is dropped by the parser, and
 * one written onto the closing fence's line becomes part of the content
 * (`$$Q\n$$` renders as an empty formula, `$$\nQ$$` as `Q$$`). The probe measures
 * both edges: the caret the rendering enters at, and the one a click before the
 * closing `$$` puts down. `display-math-empty-enter.js` measures `Enter`, which is
 * the same story told with a newline.
 *
 * @covers src/ui/markdown/syntax/math_edits.ts, src/ui/markdown/editing/text_commands.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const source = () => t.prose().querySelector('.markdown-source-text');
  /** Enters the formula by clicking its KaTeX rendering. */
  const enter = async () => {
    await t.click(t.prose().querySelector('[data-display="true"]'), 0.5, 0.5);
    await t.sleep(250);
  };
  /** Clicks the empty area just before a line of the source: `index` 0 is the first. */
  const clickLineStart = async (index) => {
    const pre = source();
    const box = pre.getBoundingClientRect();
    pre.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: box.left + 2,
        clientY: box.top + 15 + index * 24
      })
    );
    await t.sleep(200);
  };
  const leave = async () => {
    await t.click([...t.prose().querySelectorAll('.markdown-block')].pop(), 0.5);
    await t.sleep(400);
  };
  const rendered = () => t.prose().querySelector('[data-display="true"]')?.dataset.math ?? null;

  // The caret the rendering enters at: the end of the opening fence's line.
  await t.load('text\n\n$$\n$$\n\ntail\n');
  await enter();
  t.key('Q');
  await t.sleep(250);
  check('typing at the content edge after the opening `$$` makes a content line',
    await t.raw(),
    'text\n\n$$\nQ\n$$\n\ntail\n');
  await leave();
  check('and the formula renders what was typed', rendered(), 'Q');

  // The other edge of the same empty content: just before the closing `$$`.
  await t.load('text\n\n$$\n$$\n\ntail\n');
  await enter();
  await clickLineStart(1);
  const caret = t.caretRect();
  // The `$$` of the closing line start at the content's left edge, a character
  // each: a caret truly before them sits on that edge, not inside the pair.
  const contentLeft = Math.round(source().firstChild.getBoundingClientRect().left);
  check('the caret sits before the closing `$$`, at the closing line’s start',
    caret !== null && Math.abs(caret.x - contentLeft) <= 4,
    true);
  t.key('Q');
  await t.sleep(250);
  check('typing at the edge before the closing `$$` does the same',
    await t.raw(),
    'text\n\n$$\nQ\n$$\n\ntail\n');

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
