/**
 * A citation draws the reference its bibliography holds, not the source it was written as.
 *
 * The formatting is the app's (`services/bibliography.ts`), and the node does not import it: the
 * renderer hands it in through the render context (`ui/markdown/render_context.ts`). This holds that
 * seam — if the context were never set, the node would draw its own source instead.
 *
 * @covers src/ui/markdown/render_context.ts, src/ui/markdown/nodes/citation.ts,
 *   src/services/bibliography.ts
 * @needs-workspace
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });

  await t.load('A citation: [@smith2020].\n');
  // The bibliography is read from disk, so the formatted text arrives a moment after the block.
  let text = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await t.sleep(100);
    text = t.prose().querySelector('.markdown-citation')?.textContent ?? null;
    if (text !== null && /Smith/.test(text)) {
      break;
    }
  }

  check('the citation is rendered as a citation', t.prose().querySelector('.markdown-citation') !== null, true);
  check('and it draws the bibliography’s reference', /Smith/.test(text ?? '') && /2020/.test(text ?? ''), true);
  check('not the source it was written as', (text ?? '').includes('@smith2020'), false);

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
