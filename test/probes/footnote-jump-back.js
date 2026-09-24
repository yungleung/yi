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
  // The caret lands *in* the marker, and a marker holding the caret is built as its
  // own source — so what to measure is the marker element, not the superscript it
  // wears otherwise.
  const marker = t.prose().querySelector('[data-footnote-ref]');
  const markerBox = marker ? box(marker) : null;
  return {
    before,
    caret,
    showsSource: Boolean(t.prose().querySelector('.markdown-footnote-source')),
    markerBox,
    caretAtMarker:
      caret && markerBox ? caret.y >= markerBox.top - 6 && caret.y <= markerBox.bottom + 6 : null
  };
})()
