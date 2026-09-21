/**
 * A revealed source ends when the caret goes elsewhere, on the default
 * document, for a node that still reveals its source: an inline formula.
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const formula = () => t.prose().querySelector('[data-display="false"]');
  const source = () => t.prose().querySelector('.markdown-math-source');
  check('the default document renders its inline formula', formula() !== null, true);
  await t.click(formula(), 0.5);
  check('clicking it opens its source', source() !== null, true);
  const away = [...t.prose().querySelectorAll('.markdown-block')].pop();
  await t.click(away, 0.5);
  await t.sleep(300);
  check('clicking away renders it again', source() === null && formula() !== null, true);
  check('with the document untouched', t.prose().textContent.includes('$E = mc^2$'), false);
  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
