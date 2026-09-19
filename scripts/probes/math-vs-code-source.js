/**
 * The same keystroke in both kinds of block: a space at the end of a line.
 *
 * A fenced code block and a display formula being edited are both the raw text
 * of the block, so the two should behave alike: the space reaches the document,
 * shows in what is rendered, and leaves the caret after it.
 */
(async () => {
  const t = window.__t;
  const out = {};
  await t.load('text\n\n```ts\nlet a = 1;\n```\n\n$$\n\\frac{a}{b}\n$$\n');

  // A fenced code block is always shown as its source.
  const pre = t.prose().querySelector('pre');
  await t.click(pre, 0.99);
  out.codeCaretBefore = t.caretRect();
  t.key(' ');
  await t.sleep(300);
  out.codeText = t.prose().querySelector('pre code')?.textContent ?? null;
  out.codeCaretAfter = t.caretRect();
  t.report({ ...out });

  // A display formula shows its source once it is clicked.
  const formula = t.prose().querySelector('[data-display="true"]');
  const formulaBox = formula.getBoundingClientRect();
  formula.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: Math.round(formulaBox.left + 4),
      clientY: Math.round(formulaBox.top + 4)
    })
  );
  await t.sleep(300);
  const span = t.prose().querySelector('.markdown-math-source');
  out.revealed = span !== null;
  if (span) {
    // Click at the end of the formula's own line.
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
    let text = null;
    let at = -1;
    let node;
    while ((node = walker.nextNode())) {
      const found = node.data.indexOf('\\frac{a}{b}');
      if (found >= 0) {
        text = node;
        at = found + '\\frac{a}{b}'.length;
        break;
      }
    }
    if (text) {
      const target = document.createRange();
      target.setStart(text, at);
      target.collapse(true);
      const rect = target.getBoundingClientRect();
      span.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: Math.round(rect.left),
          clientY: Math.round(rect.top + rect.height / 2)
        })
      );
      await t.sleep(200);
      out.mathCaretBefore = t.caretRect();
      t.key(' ');
      await t.sleep(300);
      out.mathSource = t.prose().querySelector('.markdown-math-source')?.textContent ?? null;
      out.mathCaretAfter = t.caretRect();
    }
  }
  t.report({ ...out });
  out.raw = await t.raw();
  return out;
})()
