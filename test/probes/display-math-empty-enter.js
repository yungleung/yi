/**
 * `Enter` in an empty display formula: a blank content line, not a caret left
 * between the two fence lines it has just split.
 *
 * A formula written on one line (`$$$$`) has no content line at all, so the plain
 * newline used to leave the caret immediately before the closing `$$` — where the
 * next character landed on the fence and became part of the formula's content.
 * The probe presses `Enter`, types, and leaves the formula: what renders then is
 * the proof the character reached the content.
 *
 * @covers src/ui/markdown/syntax/math_edits.ts, src/ui/markdown/editing/text_commands.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });

  await t.load('text\n\n$$$$\n\ntail\n');
  await t.click(t.prose().querySelector('[data-display="true"]'), 0.5, 0.5);
  await t.sleep(250);
  t.key('Enter');
  await t.sleep(280);
  check('Enter in an empty display formula leaves a blank content line',
    await t.raw(),
    'text\n\n$$\n\n$$\n\ntail\n');
  t.key('Q');
  await t.sleep(250);
  check('and the character typed after it takes that line',
    await t.raw(),
    'text\n\n$$\nQ\n$$\n\ntail\n');
  await t.click([...t.prose().querySelectorAll('.markdown-block')].pop(), 0.5);
  await t.sleep(400);
  check(
    'which the formula renders',
    t.prose().querySelector('[data-display="true"]')?.dataset.math ?? null,
    'Q'
  );

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
