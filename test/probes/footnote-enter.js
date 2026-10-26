/**
 * Enter at the end of a footnote: the line below it keeps the paragraph skip,
 * and the page stays where the reader left it.
 */
(async () => {
  const t = window.__t;
  await t.load(
    'A sentence with a footnote.[^1]\n\n' +
      '[^1]: This is the footnote content rendered as a definition-style note.\n'
  );
  const footnote = t.blocks().find((b) => b.textContent.includes('footnote content'));
  const node = t.textNodesIn(footnote).find((n) => n.data.includes('footnote content'));
  footnote.scrollIntoView({ block: 'center' });
  await t.sleep(250);
  const range = document.createRange();
  range.setStart(node, node.data.length);
  range.collapse(true);
  const rect = range.getBoundingClientRect();
  node.parentElement.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      clientX: rect.left,
      clientY: rect.top + rect.height / 2
    })
  );
  await t.sleep(250);
  const before = {
    scrollTop: Math.round(t.scroller().scrollTop),
    caret: t.caretRect(),
    textBottom: Math.round(rect.bottom)
  };
  t.key('Enter');
  await t.sleep(400);
  const emptyLine = t.emptyLines()[0] ?? null;
  return {
    before,
    after: {
      scrollTop: Math.round(t.scroller().scrollTop),
      caret: t.caretRect(),
      emptyLine,
      gapToFootnote: emptyLine ? emptyLine.top - before.textBottom : null
    }
  };
})()
