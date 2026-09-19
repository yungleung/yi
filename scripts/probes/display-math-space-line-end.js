(async () => {
  const t = window.__t;
  const doc = ['Display math:', '', '$$', '\\frac{d}{dx}(\\sin x) = \\cos x \\\\', 'e^{i 2\\pi} = 1', '$$', '', 'after'].join('\n') + '\n';
  await t.load(doc);
  const formula = t.prose().querySelector('[data-display="true"]');
  const box = formula.getBoundingClientRect();
  formula.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: Math.round(box.left + 4), clientY: Math.round(box.top + 4) }));
  await t.sleep(350);
  const span = () => t.prose().querySelector('.markdown-math-source');
  // Find the last content line and put the caret at its end.
  const walker = document.createTreeWalker(span(), NodeFilter.SHOW_TEXT);
  let text = null, at = -1, node;
  while ((node = walker.nextNode())) {
    const found = node.data.indexOf('= 1');
    if (found >= 0) { text = node; at = found + '= 1'.length; break; }
  }
  const target = document.createRange();
  target.setStart(text, at);
  target.collapse(true);
  const rect = target.getBoundingClientRect();
  span().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: Math.round(rect.left), clientY: Math.round(rect.top + rect.height / 2) }));
  await t.sleep(200);
  t.report({ before: { source: span() ? span().textContent : null, caret: t.caretRect(), blocks: t.prose().querySelectorAll('.markdown-block').length } });
  t.key(' ');
  await t.sleep(400);
  const after = span();
  const result = {
    sourceAfter: after ? after.textContent : null,
    caretAfter: t.caretRect(),
    blocksAfter: t.prose().querySelectorAll('.markdown-block').length,
    katexAfter: t.prose().querySelectorAll('.katex').length,
    textAfter: [...t.prose().querySelectorAll('.markdown-block')].map((b) => b.textContent.slice(0, 18))
  };
  t.report(result);
  return result;
})()
