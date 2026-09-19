/**
 * Tab inside a revealed display formula types two spaces, like fenced code —
 * and the caret stays where the edit left it, so the next keystroke lands
 * after them rather than somewhere the rendering round-trip dropped it.
 */
(async () => {
  const t = window.__t;
  const clickCharacter = (char) => {
    const span = t.prose().querySelector('.markdown-math-source');
    // The source is highlighted: the character is in one of many text nodes.
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
    let text = null;
    let at = -1;
    let node;
    while ((node = walker.nextNode())) {
      const found = node.data.indexOf(char);
      if (found >= 0) {
        text = node;
        at = found;
        break;
      }
    }
    if (!text) {
      return false;
    }
    const target = document.createRange();
    target.setStart(text, at);
    target.setEnd(text, at + 1);
    const rect = target.getBoundingClientRect();
    span.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: Math.round(rect.left + rect.width / 2),
        clientY: Math.round(rect.top + rect.height / 2)
      })
    );
    return true;
  };
  await t.load('text\n\n$$\n\\frac{a}{b}\n$$\n');
  const formula = t.prose().querySelector('[data-display="true"]');
  const box = formula.getBoundingClientRect();
  formula.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: Math.round(box.left + 4),
      clientY: Math.round(box.top + 4)
    })
  );
  await t.sleep(250);
  const span = t.prose().querySelector('.markdown-math-source');
  if (!span) {
    return { error: 'the source did not reveal' };
  }
  const sourceBefore = span.textContent;
  const clicked = clickCharacter('{b}');
  await t.sleep(200);
  t.report({ sourceBefore, clicked, caretBefore: t.caretRect() });
  t.scroller().dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
  );
  await t.sleep(300);
  t.report({ sourceBefore, afterTab: t.prose().querySelector('.markdown-math-source')?.textContent ?? null });
  t.key('X');
  await t.sleep(300);
  return {
    sourceBefore,
    afterTab: t.prose().querySelector('.markdown-math-source')?.textContent ?? null,
    raw: await t.raw(),
    caret: t.caretRect()
  };
})()
