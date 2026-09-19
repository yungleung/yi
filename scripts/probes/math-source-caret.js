/**
 * Clicking inside a revealed display formula puts the caret where the pointer
 * is — not at the end of the nearest source line.
 */
(async () => {
  const t = window.__t;
  const doc = 'text\n\n$$\n\\frac{a}{b} + c\n$$\n\ntail\n';
  await t.load(doc);
  const formula = t.prose().querySelector('[data-display="true"]');
  const box = formula.getBoundingClientRect();
  formula.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: Math.round(box.left + 4),
      clientY: Math.round(box.top + 4)
    })
  );
  await t.sleep(250);
  const span = t.prose().querySelector('.markdown-math-source');
  if (!span) {
    return { error: 'the source did not reveal' };
  }
  const text = span.firstChild;
  const at = text.data.indexOf('+ c');
  const target = document.createRange();
  target.setStart(text, at);
  target.setEnd(text, at + 1);
  const targetRect = target.getBoundingClientRect();
  const clickX = Math.round(targetRect.left + targetRect.width / 2);
  const clickY = Math.round(targetRect.top + targetRect.height / 2);
  t.report({ sourceText: text.data, targetChar: text.data.slice(at, at + 1), clickX, clickY });
  span.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: clickX,
      clientY: clickY
    })
  );
  await t.sleep(250);
  const caret = t.caretRect();
  return {
    sourceText: text.data,
    targetChar: text.data.slice(at, at + 1),
    targetX: Math.round(targetRect.left),
    clickX,
    caret,
    caretAtTheClickedCharacter: caret ? Math.abs(caret.x - clickX) <= 6 : null
  };
})()
