/**
 * Entering a formula's source and pressing Enter at the bottom of a long
 * document: the caret stays on screen, the page does not leap away, and the
 * blank line the Enter makes is inside the formula.
 *
 * The block does change height when it swaps KaTeX for its own text, so the
 * content below it moves — that is the block growing, and the page is allowed
 * to scroll the caret into view for it. What must not happen is the caret
 * being lost or the view jumping somewhere else in the document.
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const filler = Array.from({ length: 40 }, (_, index) => `Paragraph ${index} of the note.`).join(
    '\n\n'
  );
  const doc = `${filler}\n\n$$\n\\frac{a}{b}\n+ c\n$$\n\ntail\n`;
  await t.load(doc);
  const scroller = t.scroller();
  scroller.scrollTop = scroller.scrollHeight;
  await t.sleep(300);
  const onScreen = () => {
    const caret = t.caretRect();
    const view = scroller.getBoundingClientRect();
    return caret !== null && caret.y >= view.top && caret.y <= view.bottom;
  };
  const started = Math.round(scroller.scrollTop);

  await t.click(t.prose().querySelector('[data-display="true"]'), 0.5, 0.5);
  await t.sleep(300);
  check('the caret is on screen after the click', onScreen(), true);
  const afterClick = Math.round(scroller.scrollTop);
  checks.push({
    name: 'and the page did not leap (less than a viewport)',
    actual: Math.abs(afterClick - started) < scroller.clientHeight,
    expected: true,
    pass: Math.abs(afterClick - started) < scroller.clientHeight
  });

  t.key('Enter');
  await t.sleep(400);
  check('the caret is on screen after the Enter', onScreen(), true);
  check('the caret is on the line the Enter made', t.prose().querySelector('.markdown-source-text')?.textContent ?? null, '\\frac{a}{b}\n+ c\n\n');
  check(
    'and the blank line is inside the formula',
    await t.raw(),
    `${filler}\n\n$$\n\\frac{a}{b}\n+ c\n\n$$\n\ntail\n`
  );
  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name), scroll: { started, afterClick } };
})()
