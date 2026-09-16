/**
 * Reports the geometry and the scroll deltas around Enter at the end of a
 * paragraph, in whatever window this runs in.
 *
 * The jump could not be reproduced in a tall editor window, where the default
 * document fits inside the virtualized window (±1200px) and nothing has to be
 * estimated. Run this with the window at the size where you see the jump, then
 * paste the output:
 *
 *   node scripts/tauri-probe.mjs --install
 *   node scripts/tauri-probe.mjs scripts/probes/jump-report.js
 *
 * The flow it follows is the reported one: scroll to the end of the document
 * first, come back to the footnote, then press Enter.
 *
 * How to read it:
 * - `topSpacer` changing across the edit → the spacer heights moved the
 *   content (a placeholder height replaced by a measured one);
 * - `mountedBlocks` changing → the virtualized window moved with the caret;
 * - spacers and blocks unchanged but `scrollTop` moving → something scrolled
 *   (the caret being brought into view, or the browser).
 */
(async () => {
  const t = window.__t;
  const out = t.report({});
  const scroller = t.scroller();
  const spacerHeight = (position) => {
    const spacer = t.prose().querySelector(`[data-virtual-spacer="${position}"]`);
    return spacer ? Math.round(spacer.getBoundingClientRect().height) : null;
  };
  const geometry = () => ({
    scrollTop: Math.round(scroller.scrollTop),
    scrollHeight: Math.round(scroller.scrollHeight),
    clientHeight: scroller.clientHeight,
    topSpacer: spacerHeight('top'),
    bottomSpacer: spacerHeight('bottom'),
    mountedBlocks: t.blocks().length
  });

  out.doc = geometry();

  const target = t.blocks().find((b) => b.textContent.includes('footnote content'))
    ?? t.blocks().find((b) => b.textContent.includes('Theorem'))
    ?? t.blocks().find((b) => t.textNodesIn(b).length > 2);
  if (!target) {
    out.error = 'no target block';
    return out;
  }
  out.target = target.textContent.slice(0, 40);

  const targetY = () =>
    Math.round(target.getBoundingClientRect().top - scroller.getBoundingClientRect().top);

  // 1. The end of the document first, as the reader did.
  scroller.scrollTop = scroller.scrollHeight;
  await t.sleep(500);
  out.atEnd = { ...geometry(), targetY: targetY() };

  // 2. Then back to the footnote.
  scroller.scrollTop = Math.round(scroller.scrollTop + targetY() - 200);
  await t.sleep(500);
  out.backAtTarget = { ...geometry(), targetY: targetY() };

  const node = t.textNodesIn(target).find((n) => n.data.length > 4);
  if (!node) {
    out.error = 'no text node in target';
    return out;
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
  await t.sleep(250);

  out.before = { ...geometry(), targetY: targetY() };
  t.key('Enter');
  await t.sleep(500);
  out.after = { ...geometry(), targetY: targetY() };
  out.contentMoved = out.after.targetY - out.before.targetY;
  return out;
})()
