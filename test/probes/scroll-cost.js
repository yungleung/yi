/**
 * The cost of scrolling through a document that really virtualizes: how long
 * each scroll step takes to settle, and how many blocks it rebuilt.
 *
 * Run it with the editor window in the foreground: a webview whose window is
 * occluded throttles animation frames almost to zero, and every step then
 * reports `settled: false` instead of a time. A page that has been through many
 * hot reloads and document loads also reports larger times than a fresh one.
 *
 *   node test/tauri-probe.mjs --install
 *   node test/tauri-probe.mjs test/probes/scroll-cost.js
 *
 * Open the document you want to measure first (the probe uses whatever is in
 * the editor), or pass one of the helper flows in `test/probes/real-docs.js`.
 */
* @needs-large-document — run against the 323 KB fixture note.
 * @needs-foreground-window — the editor window must be visible: an occluded webview throttles
 * animation frames, and every step then reports `settled: false` instead of a time.
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
    const settled = await nextFrames(2);
    const after = t.blocks();
    return {
      ms: Math.round(performance.now() - started),
      settled,
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

/** Waits for a couple of animation frames, or gives up if they are throttled. */
function nextFrames(count) {
  return new Promise((resolve) => {
    let seen = 0;
    const tick = () => {
      seen += 1;
      if (seen >= count) {
        resolve(true);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(() => resolve(false), 500);
  });
}
