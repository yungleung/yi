(async () => {
  const t = window.__t;
  const out = t.report({});

  /** Puts the caret inside the text node holding `needle`. */
  const caretAt = async (needle, inside = needle.length) => {
    const block = t.blocks().find((b) => b.textContent.includes(needle));
    const node = t.textNodesIn(block).find((n) => n.data.includes(needle));
    const index = node.data.indexOf(needle) + inside;
    const range = document.createRange();
    range.setStart(node, index);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: rect.left,
        clientY: rect.top + rect.height / 2
      })
    );
    await t.sleep(120);
    return Math.round(rect.top);
  };

  const run = async (markdown, needle, inside) => {
    await t.load(markdown);
    const before = await t.raw();
    const targetY = await caretAt(needle, inside);
    t.key('Enter');
    await t.sleep(200);
    return {
      before,
      after: await t.raw(),
      caret: t.caretRect(),
      targetY,
      emptyLines: t.emptyLines().map((line) => line.top)
    };
  };

  // A blank list item has no text node to aim at: click its placeholder.
  const blankItem = async () => {
    await t.load('- a\n- \n- b\n');
    const item = t.blocks().find((b) => b.textContent.includes('a'));
    await t.click(item.querySelector('.markdown-list-placeholder').closest('li'));
    t.key('Enter');
    await t.sleep(200);
    return {
      after: await t.raw(),
      caret: t.caretRect(),
      emptyLines: t.emptyLines().map((line) => line.top)
    };
  };

  out.endOfMiddleParagraph = await run('first line\n\nsecond line\n', 'first line');
  out.endOfLastParagraph = await run('only line\n', 'only line');
  out.midParagraph = await run('alpha beta\n', 'alpha ', 5);
  out.blankItem = await blankItem();
  return out;
})()
