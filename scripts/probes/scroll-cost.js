/**
 * The cost of scrolling through a document that really virtualizes: how long
 * each scroll step takes to settle, and how many blocks it rebuilt.
 *
 * Run it after the app has been started fresh — a page that has been through
 * many hot reloads and document loads reports step times orders of magnitude
 * larger than the same code does on a fresh one.
 *
 *   node scripts/tauri-probe.mjs --install
 *   node scripts/tauri-probe.mjs scripts/probes/scroll-cost.js
 *
 * Open the document you want to measure first (the probe uses whatever is in
 * the editor), or pass one of the helper flows in `scripts/probes/real-docs.js`.
 */
(async () => {
  const t = window.__t;
  const out = t.report({});
  const scroller = t.scroller();
  out.doc = {
    scrollTop: Math.round(scroller.scrollTop),
    scrollHeight: Math.round(scroller.scrollHeight),
    clientHeight: scroller.clientHeight,
    mountedBlocks: t.blocks().length
  };

  const step = async (delta) => {
    const before = new Set(t.blocks());
    const started = performance.now();
    scroller.scrollTop = scroller.scrollTop + delta;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = t.blocks();
    return {
      ms: Math.round(performance.now() - started),
      mounted: after.length,
      rebuilt: after.filter((element) => !before.has(element)).length
    };
  };

  out.down = [];
  out.back = [];
  for (let index = 0; index < 3; index += 1) {
    out.down.push(await step(400));
  }
  for (let index = 0; index < 3; index += 1) {
    out.back.push(await step(-400));
  }
  return out;
})()
