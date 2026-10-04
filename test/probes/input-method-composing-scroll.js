/**
 * A word being composed survives its block leaving the window — exactly once.
 *
 * Only the blocks near the viewport are mounted, and a block that leaves is handed to the
 * renderer to be used again (`virtual_block_renderer.ts: keepSpare`). A composing word lives
 * *inside* that block, so it has to be one node that moves with the caret: a second span made
 * when the first left would come back into the page with the block it was left in, and the
 * reader would see the word twice.
 *
 * @covers src/ui/markdown/editing/composition_view.ts: show
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const seam = () => document.querySelector('.markdown-composition-input');
  const composing = () => [...t.prose().querySelectorAll('[data-composing]')];
  /** The block the caret is drawn in — the caret span itself lives in the page, not a block. */
  const caretBlock = () => {
    const caret = document.querySelector('.markdown-caret');
    if (!caret) {
      return null;
    }
    const line = caret.getBoundingClientRect().top;
    return (
      t.blocks().find((block) => {
        const rect = block.getBoundingClientRect();
        return line >= rect.top - 2 && line <= rect.bottom + 2;
      }) ?? null
    );
  };
  const shown = () => composing()[0]?.closest('.markdown-block') ?? null;

  // Long enough that the top block is well out of the window at the bottom.
  const tall = Array.from({ length: 200 }, (_, index) => `line ${index}`).join('\n\n') + '\n';
  await t.load(tall);
  await t.sleep(200);
  await t.click(t.blocks()[0], 0.5, 0.5);
  await t.sleep(250);
  const anchored = caretBlock();
  check('the caret sits in a block of its own', anchored !== null, true);

  const area = seam();
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  area.value = 'ni';
  area.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'ni', bubbles: true }));
  await t.sleep(200);
  check('the word is written into that block', shown(), anchored);

  // The reader scrolls the block out of the window and back, and types the next letter.
  const scroller = t.scroller();
  scroller.scrollTop = scroller.scrollHeight;
  await t.sleep(400);
  check('the block has left the window', t.blocks().includes(anchored), false);
  scroller.scrollTop = 0;
  await t.sleep(400);
  check('and the renderer hands its element back', t.blocks()[0] === anchored, true);
  area.value = 'nihao';
  area.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'nihao', bubbles: true }));
  await t.sleep(250);

  check('the word comes back once, not twice', composing().length, 1);
  check('with the whole word', composing()[0]?.textContent ?? null, 'nihao');
  check('in the block the caret is in', shown(), caretBlock());

  area.value = '';
  area.dispatchEvent(new CompositionEvent('compositionend', { data: '', bubbles: true }));
  await t.sleep(200);
  check('and nothing is left in the page', t.prose().querySelectorAll('[data-composing]').length, 0);
  check('with the document untouched', await t.raw(), tall);

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
