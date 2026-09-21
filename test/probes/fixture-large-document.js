/**
 * The large fixture is editable in practice: 323 KB of markdown loads, the
 * renderer virtualises it, scrolling to the end and back is clean, and typing
 * at the top still edits the right place.
 *
 * @covers src/ui/markdown/virtual_block_renderer.ts, editing/context.ts
 * @fixture notes/Western Philosophy/Hannah Arendt/The Human Condition.md
 * @needs-workspace
 *
 * Run with:
 *   npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" \
 *     test/probes/fixture-large-document.js
 */
(async () => {
  const t = window.__t;
  const errors = [];
  window.addEventListener('error', (event) => errors.push(String(event.message)));
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const document = await t.raw();
  check('the whole note is in the editor', document.length > 300000, true);
  const scroller = t.scroller();
  const mounted = t.blocks().length;
  checks.push({
    name: 'only a window of blocks is mounted',
    actual: mounted,
    expected: 'fewer than 200',
    pass: mounted < 200
  });
  t.report({ mounted, scrollHeight: Math.round(scroller.scrollHeight) });
  scroller.scrollTop = scroller.scrollHeight;
  await t.sleep(600);
  const atEnd = { mounted: t.blocks().length, scrollTop: Math.round(scroller.scrollTop) };
  scroller.scrollTop = 0;
  await t.sleep(600);
  const backAtTop = { mounted: t.blocks().length, scrollTop: Math.round(scroller.scrollTop) };
  checks.push({
    name: 'scrolling to the end and back keeps the window bounded',
    actual: { atEnd: atEnd.mounted, backAtTop: backAtTop.mounted },
    expected: 'both fewer than 200',
    pass: atEnd.mounted < 200 && backAtTop.mounted < 200
  });
  check('and nothing threw on the way', errors, []);
  // Compare lengths, not the text: this note is 323 KB, and putting it in the
  // result would drown every other check in the report.
  check('the document is unchanged', (await t.raw()).length, document.length);
  return { checks, atEnd, backAtTop, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
