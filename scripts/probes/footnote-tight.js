/**
 * A footnote written at the end of a paragraph stays tight: the definition
 * goes on the next line, inside the same block as the paragraph it annotates.
 */
(async () => {
  const t = window.__t;
  const button = () =>
    [...document.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === 'Footnote'
    );
  await t.load('Body text.\n\nLast paragraph.\n');
  await t.click(t.blocks()[1], 0.99);
  const target = button();
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  target.click();
  await t.sleep(350);
  const blocks = [...t.prose().querySelectorAll('.markdown-block')];
  const last = blocks[blocks.length - 1];
  return {
    blocks: blocks.length,
    blockTexts: blocks.map((block) => block.textContent),
    lastBlockHasDefinition: last.querySelector('.markdown-footnote') !== null,
    definitionLabel: last.querySelector('[data-footnote-def]')?.textContent ?? null,
    sups: t.prose().querySelectorAll('sup').length,
    caret: t.caretRect()
  };
})()
