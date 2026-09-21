/** Clicking a footnote marker jumps to its definition. */
(async () => {
  const t = window.__t;
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom)
    };
  };
  await t.load('Body text[^1] here.\n\n[^1]: The definition.\n');
  const sup = t.prose().querySelector('sup');
  const definition = t.prose().querySelector('.markdown-footnote');
  const before = { caret: t.caretRect(), sup: box(sup), definition: box(definition) };
  t.report({ before });
  sup.querySelector('a').dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 0, clientY: 0 })
  );
  await t.sleep(300);
  const caret = t.caretRect();
  const definitionBox = box(t.prose().querySelector('.markdown-footnote'));
  return {
    before,
    caret,
    definitionBox,
    caretInDefinition:
      caret && definitionBox
        ? caret.y >= definitionBox.top - 2 && caret.y <= definitionBox.bottom + 2
        : null
  };
})()
