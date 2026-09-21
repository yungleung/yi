/**
 * Clicking an empty cell puts the caret inside that cell. Small on purpose:
 * the dev page needs a couple of seconds per interaction, and a probe that
 * outlives the bridge's budget still reports what it managed to measure.
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
  await t.load(['| A | B |', '| --- | --- |', '| 1 |  |', ''].join('\n'));
  const empty = t.prose().querySelector('[data-table-cell="1:1"]');
  const cellRect = empty ? box(empty) : null;
  t.report({
    hasCellTag: empty !== null,
    hasPlaceholder: empty?.querySelector('.markdown-table-placeholder') !== null,
    cellRect
  });
  await t.click(empty ?? t.blocks()[0]);
  const caret = t.caretRect();
  const inside =
    caret && cellRect
      ? caret.x >= cellRect.left - 2 &&
        caret.x <= cellRect.right + 2 &&
        caret.y >= cellRect.top - 2 &&
        caret.y <= cellRect.bottom + 2
      : null;
  return { hasCellTag: empty !== null, hasPlaceholder: empty?.querySelector('.markdown-table-placeholder') !== null, cellRect, caret, caretInsideCell: inside };
})()
