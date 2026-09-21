/**
 * The footnote button writes a marker at the caret and a definition line at
 * the end — and the marker renders as a superscript link, which it only can
 * once the parser has seen the definition.
 */
(async () => {
  const t = window.__t;
  const button = () =>
    [...document.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === 'Footnote'
    );
  await t.load('Body text.\n\nLast paragraph.\n');
  await t.click(t.blocks()[0], 0.4);
  const before = {
    sups: t.prose().querySelectorAll('sup').length,
    definitions: t.prose().querySelectorAll('.markdown-footnote').length,
    caret: t.caretRect()
  };
  t.report({ before });
  const target = button();
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  target.click();
  await t.sleep(350);
  const sup = t.prose().querySelector('sup');
  const definition = t.prose().querySelector('.markdown-footnote');
  const after = {
    sups: t.prose().querySelectorAll('sup').length,
    supText: sup ? sup.textContent : null,
    supTag: sup ? sup.tagName : null,
    supHasJumpTarget: sup ? sup.dataset.footnoteRef ?? null : null,
    definitions: t.prose().querySelectorAll('.markdown-footnote').length,
    definitionText: definition ? definition.textContent : null,
    definitionIsLast: definition
      ? definition === t.blocks().pop()?.lastElementChild
      : null,
    caret: t.caretRect(),
    supRect: sup ? t.rectOf(sup) : null
  };
  t.report({ before, after });
  return { before, after };
})()
