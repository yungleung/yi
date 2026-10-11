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
 * The assertion is relative to what the scroller holds, so it holds for a short note too (where
 * the whole document *is* the window, and mounting it again changes nothing) — and the probe is
 * kept inside the bridge's five seconds on a *cold* page as well: measured there, reading the
 * document with `t.raw()` and converging the scroll over eight steps ran the probe past the
 * budget (5 016 ms, cut off), so the scroll gets six steps and the scroller's own height is what
 * says whether this is a long note.
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
  const started = performance.now();
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  // The reader walks to the end of the note and puts the caret after its last character. The
  // scroller's own height is what says whether this is a note the window has to be a window in:
  // a short document's window *is* the whole document, and mounting it again changes nothing.
  const scroller = t.scroller();
  const long = scroller.scrollHeight > 4000;
  for (let step = 0; step < 6; step += 1) {
    scroller.scrollTop = scroller.scrollHeight;
    await t.sleep(250);
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
      break;
    }
  }
  // The last *text* a block near the end holds: the window's own last block may be a thematic
  // break or an image, and a probe that reads `.data` off nothing throws — measured on a cold
  // page, where the mounted window is not yet where the reader put it (the harness reads a
  // probe's throw as "the helpers may be gone", reinstalls them and runs the probe again).
  const node = t
    .blocks()
    .map((block) => t.textNodesIn(block).pop())
    .filter(Boolean)
    .pop();
  if (!node) {
    return {
      long,
      error: 'no text is mounted near the end of the document',
      checks: [],
      failed: []
    };
  }
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
  await t.sleep(200);

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
  // The whole-document mount starts at the document's *first* block, which is what the window
  // of a reader at the end can never be. How many blocks an end window holds is not the
  // question: with the estimates under-counting it is 69, measured, against 25 with the
  // heights known — and 484 when the whole note comes back.
  check(
    'the caret is in a window, not in the whole document',
    before.first > 1 || !long,
    { before, long }
  );
  for (let step = 1; step <= 3; step += 1) {
    t.key('x');
    await new Promise((resolve) => requestAnimationFrame(() => resolve(true)));
    await t.sleep(120);
    const after = mountedWindow();
    check(
      `keystroke ${step} leaves the window it found`,
      after.first > 1 || !long,
      { before, after, long }
    );
    // The steps are reported as they are measured, so a run cut off by the bridge still says
    // which keystroke did it.
    t.report({ checks, long, before, after, tookMs: Math.round(performance.now() - started) });
  }
  return {
    long,
    before,
    after: mountedWindow(),
    tookMs: Math.round(performance.now() - started),
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
