/** Clicking a definition's label jumps back to its marker. */
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
  const anchor = t.prose().querySelector('[data-footnote-def]');
  const before = { caret: t.caretRect(), label: anchor ? anchor.textContent : null };
  t.report({ before });
  anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 0, clientY: 0 }));
  await t.sleep(300);
  const caret = t.caretRect();
  const supBox = box(t.prose().querySelector('sup'));
  return {
    before,
    caret,
    supBox,
    caretAtMarker: caret && supBox ? caret.y >= supBox.top - 6 && caret.y <= supBox.bottom + 6 : null
  };
})()
