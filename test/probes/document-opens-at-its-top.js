/**
 * A document that arrives starts at its own top, not at the place the last one was scrolled to.
 *
 * The renderer keeps the scroller's geometry — `scrollTop` and `clientHeight` — so that a rebuild
 * does not have to lay the document out to ask for them (`virtual_block_renderer.ts: readGeometry`).
 * A document that arrives is a different document, and the window that describes it cannot be
 * computed from where the last one happened to be: read from there, the new document is windowed at
 * the other one's pixel position and the top of it is never mounted until something scrolls.
 *
 * The probe makes the difference unmistakable: it loads a long document of short paragraphs, scrolls
 * it to its end, loads the same text again, and watches the first frames. A window computed from the
 * last document's place starts far down the new one; the reader, meanwhile, is at the top of a
 * document they just opened.
 *
 * @covers src/ui/markdown/virtual_block_renderer.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  // Short paragraphs, many of them: the mounted window is then a narrow band, and where it starts
  // says plainly whether the document is at its top.
  const text = Array.from(
    { length: 80 },
    (_, index) => `Paragraph number ${index} with a sentence or two of ordinary prose in it.`
  ).join('\n\n');
  const scroller = t.scroller();
  const firstMountedLine = () =>
    Math.min(...[...document.querySelectorAll('.prose .markdown-block')].map((block) => Number(block.dataset.lineStart)));

  await t.load(text);
  await t.sleep(700);
  check('the document arrives at its own top', firstMountedLine() === 1, firstMountedLine());

  scroller.scrollTop = scroller.scrollHeight;
  await t.sleep(500);
  const atEnd = firstMountedLine();
  check('and it can be scrolled to its end', atEnd > 1, atEnd);

  await t.load(text);
  const frames = [];
  let running = true;
  const sample = () => {
    if (running) {
      frames.push(firstMountedLine());
      requestAnimationFrame(sample);
    }
  };
  requestAnimationFrame(sample);
  await t.sleep(600);
  running = false;

  check('so the next document arrives at its top too, not at the last one’s place', frames[0] === 1, {
    scrolledTo: atEnd,
    frames: frames.slice(0, 10)
  });

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
