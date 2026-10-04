/**
 * The seam is invisible because it *paints* nothing, and it stays where the caret is.
 *
 * The field is a real box — the system will not compose in one as short as a line, which is what
 * `styles.css` records — so on the reader's last visible line its box reaches past the editor's
 * bottom edge and over the status bar. What was seen there was not the box but what the system
 * *paints* in it: the ink is transparent, the caret that follows from it is transparent, and the
 * selection over a marked word was not. Moving the field up until it fits keeps the box inside and
 * costs a second mark — the field's own caret on a line above the reader's, which is what the
 * reader saw next. So the field is left at the caret and made to paint nothing.
 *
 * @covers src/styles.css: `.markdown-composition-input::selection`
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const field = () => document.querySelector('.markdown-composition-input');

  const tall = Array.from({ length: 60 }, (_, index) => `line ${index}`).join('\n\n') + '\n';
  await t.load(tall);
  await t.sleep(200);
  await t.click(t.blocks()[0], 0.5, 0.2);
  await t.sleep(200);
  // Down the document, line by line: the editor scrolls to keep the caret in view, so it ends up
  // on the reader's last visible line — the one right above the status bar.
  for (let step = 0; step < 40; step += 1) {
    t.key('ArrowDown');
    await t.sleep(30);
  }
  await t.sleep(250);

  // The system is using the field: this is when it paints in it.
  const area = field();
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  area.value = 'nihao';
  area.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'nihao', bubbles: true }));
  await t.sleep(200);

  const caret = t.caretRect();
  const view = t.scroller().getBoundingClientRect();
  const box = area.getBoundingClientRect();
  check('the caret is on the line above the bottom edge', caret !== null && caret.y > view.bottom - 60, true);
  // Not moved: the caret the system draws in the field is then on the reader's own line, which is
  // what a second mark was.
  check('the field is on the caret’s own line', Math.abs(box.top - (caret?.y ?? 0)) <= 1, true);
  check('and on the caret’s own column', Math.abs(box.left - (caret?.x ?? 0)) <= 4, true);
  // And nothing of it may be drawn. The ink and the caret that follows from it are readable here;
  // the selection over the marked word is the third, and WebKit reports the same computed value
  // for that pseudo-element whether its rule is there or not — so it is held by the rule in
  // `styles.css` rather than by a check that passes either way.
  check('with nothing of the field drawn', [getComputedStyle(area).color, getComputedStyle(area).caretColor], [
    'rgba(0, 0, 0, 0)',
    'rgba(0, 0, 0, 0)'
  ]);
  check('with the marked word drawn in the line', document.querySelector('[data-composing]')?.textContent ?? null, 'nihao');

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
