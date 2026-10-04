/**
 * Writing into an empty display formula: the character goes into the content,
 * whichever edge of the empty content the caret was put at.
 *
 * A `$$` line only delimits a formula while it is the fence and nothing else, so a character
 * written onto the *closing* fence's line becomes part of it (`$$\nQ$$` reads as the content
 * `Q$$`). The delimiters are not drawn, so the caret enters the formula's *body* and the write is
 * pulled to that body's own last line (`syntax/fence_edits.ts`); the edge a click used to put down
 * — before the closing `$$` — is not a position the rendering has any more.
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

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
