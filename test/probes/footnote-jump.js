/**
 * Ctrl-clicking a footnote marker jumps to its definition; a plain click does not,
 * because a marker is a node whose label can be typed in (see `footnote-source.js`).
 */
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
  const click = (element, modifier) =>
    element.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 0,
        clientY: 0,
        ...(modifier ? { ctrlKey: true } : {})
      })
    );
  // A plain click opens the marker as its source; it is the Ctrl-click that jumps.
  click(sup.querySelector('a'), false);
  await t.sleep(300);
  const plainCaret = t.caretRect();
  const showedSource = Boolean(t.prose().querySelector('.markdown-footnote-source'));
  // The marker is its source now — the element the plain click was on is gone — so the
  // Ctrl-click goes to the marker as the document now renders it.
  click(t.prose().querySelector('[data-footnote-ref]'), true);
  await t.sleep(300);
  const caret = t.caretRect();
  const definitionBox = box(t.prose().querySelector('.markdown-footnote'));
  return {
    before,
    plainCaret,
    showedSource,
    caret,
    definitionBox,
    caretInDefinition:
      caret && definitionBox
        ? caret.y >= definitionBox.top - 2 && caret.y <= definitionBox.bottom + 2
        : null
  };
})()
