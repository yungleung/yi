/**
 * What a keystroke at the end of a long note leaves mounted: the window it was in, not the
 * whole document.
 *
 * The renderer keeps the geometry it last read and mounts the window that geometry asks for
 * (`virtual_block_renderer.ts`, `windowRange`), and the two have to agree about how tall the
 * document is: a block that has never been laid out is *estimated* from its line count
 * (`block_sizes.ts`), which under-counts a note whose paragraphs are taller than their lines.
 * Measured, when the scroll is past what the sizes add up to: the window comes back as block
 * one through the last block — the whole note, 484 blocks of it — and the keystroke pays for
 * laying the document out (measured in `edit-cost.js`'s own steps: 65 ms for one keystroke
 * with 24 blocks mounted, 1 105 ms for the next with 484).
 *
 * The assertion is relative to the window the caret was in, so it holds for a short note too
 * (where the whole document *is* the window, and mounting it again changes nothing).
 *
 * @covers src/ui/markdown/virtual_block_renderer.ts, src/ui/markdown/viewport_window.ts,
 *   src/ui/markdown/block_sizes.ts
 * @needs-large-document — run against the 323 KB fixture note.
 *
 * Run with:
 *   npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" \
 *     test/probes/edit-keeps-the-window.js
 *   npm run probe -- --fixture default-document.md test/probes/edit-keeps-the-window.js
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  // The document's own size, read before anything is clicked: a short note's window *is* the
  // document, and the assertions below are relative to that. (`t.raw()` leaves the document
  // selected, and the click below is what takes the selection away.)
  const { splitBlocks } = await t.app('/src/ui/markdown/document/blocks.ts');
  const blocks = splitBlocks(await t.raw()).length;

  // The reader walks to the end of the note and puts the caret after its last character.
  const scroller = t.scroller();
  for (let step = 0; step < 8; step += 1) {
    scroller.scrollTop = scroller.scrollHeight;
    await t.sleep(300);
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
      break;
    }
  }
  const last = t.blocks()[t.blocks().length - 1];
  const node = t.textNodesIn(last).pop();
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

  /** The window on screen: how many blocks, and the line the first and last of them start on. */
  const mountedWindow = () => {
    const mounted = t.blocks();
    return {
      mounted: mounted.length,
      first: Number(mounted[0]?.dataset.lineStart),
      last: Number(mounted[mounted.length - 1]?.dataset.lineStart)
    };
  };
  const before = mountedWindow();
  check(
    'the caret is in a window, not in the whole document',
    before.mounted <= 64 || blocks <= 64,
    { before, blocks }
  );
  for (let step = 1; step <= 3; step += 1) {
    t.key('x');
    await new Promise((resolve) => requestAnimationFrame(() => resolve(true)));
    await t.sleep(150);
    const after = mountedWindow();
    check(
      `keystroke ${step} leaves the window it found`,
      after.first > 1 || blocks <= 64,
      { before, after, blocks }
    );
    // The steps are reported as they are measured, so a run cut off by the bridge still says
    // which keystroke did it.
    t.report({ checks, blocks, before, after });
  }
  return {
    blocks,
    before,
    after: mountedWindow(),
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
