/**
 * A window change must not move the page to the caret.
 *
 * The renderer drops the blocks outside the window and mounts them again as the reader scrolls
 * back, and a caret whose block was dropped is placed again once that block is there. That
 * placement is a *putting back*, not a move, so it must not scroll — measured on the demo
 * document: scrolling up from the end, the caret's block came back into the window and one 24px
 * step moved the page **1097px** to a caret that had not moved at all, because the deferred
 * caret render ended in `scrollCaretIntoView` (`caret.ts`) whichever reason had asked for it.
 *
 * The caret is put in the first paragraph first, the way a click puts it there: a caret that is
 * not rendered has nothing to scroll to, which is why this only shows up after the reader has
 * clicked into the document and then scrolled away.
 *
 * @covers src/ui/markdown/caret/caret.ts, src/ui/markdown/markdown_editor.ts (reanchorCaret)
 */
(async () => {
  const t = window.__t;
  const caret = await t.app('/src/ui/markdown/caret/caret.ts');
  const scroller = t.scroller();
  /** One wheel-ish step, the size a slow scroll moves by. */
  const STEP = 24;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const frame = () =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const y = () => Math.round(scroller.scrollTop);

  // 1. The caret into the first paragraph.
  scroller.scrollTop = 0;
  await frame();
  const paragraph = t.prose().querySelector('p');
  const text = t.textNodesIn(paragraph)[0];
  const place = document.createRange();
  place.setStart(text, 5);
  place.collapse(true);
  const box = place.getBoundingClientRect();
  paragraph.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      clientX: box.left,
      clientY: box.top + box.height / 2
    })
  );
  await t.sleep(250);
  check(
    'the caret is in the first paragraph, and rendered',
    caret.getCaretRange() !== null && document.querySelector('.markdown-caret') !== null,
    {
      range: caret.getCaretRange() !== null,
      span: document.querySelector('.markdown-caret') !== null
    }
  );

  // 2. Away to the end of the document, and back up a step at a time.
  scroller.scrollTop = scroller.scrollHeight;
  await frame();
  await frame();
  const from = y();
  const steps = Math.min(20, Math.floor(from / STEP));
  const moved = [];
  for (let step = 0; step < steps && y() > 0; step += 1) {
    const before = y();
    scroller.scrollTop -= STEP;
    await frame();
    moved.push(y() - before);
  }
  check(
    'every step up moves the page by the step and nothing else',
    moved.length > 8 && moved.every((delta) => delta === -STEP),
    { from, steps, moved }
  );
  check(
    'and the caret is still rendered, where the reader left it',
    caret.getCaretRange() !== null && document.querySelector('.markdown-caret') !== null,
    {
      range: caret.getCaretRange() !== null,
      span: document.querySelector('.markdown-caret') !== null
    }
  );
  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
