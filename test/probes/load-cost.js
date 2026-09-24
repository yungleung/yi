/**
 * What a document load costs, and whether it grows while the app stays open.
 *
 * `docs/ai-context.md` has carried a warning for a while — a dev app left running for
 * hours degrades, "document loads go from ~0.3 s to ~10 s" — and nobody has measured
 * which side of the bridge that is on: the editor (its state, its renderer, its caches),
 * the page (listeners, timers, whatever a session accumulates), or the probe harness
 * itself (each `load` is an event, a wait for the editor, and a fixed tail).
 *
 * So this probe times the same load eight times in a row and reports every one, with what
 * the page has mounted afterwards: **the trend is the claim, not the level.** Run it on a
 * freshly started app and again after a whole suite and the two sets of numbers are the
 * same — 330 ms for the 314 266-character note, 27 blocks mounted, nothing accumulating.
 * A load that grows inside one run, or a count that climbs, is the regression this exists
 * to catch; a *call* that stalls is the bridge's business, and the harness prints that
 * (`bridge: … calls, median …`) beside this report.
 *
 * @covers src/ui/markdown/markdown_editor.ts, src/ui/markdown/virtual_block_renderer.ts
 * @needs-large-document — run against the 323 KB fixture note, where a load is long
 * enough for a session's accumulation to show.
 */
(async () => {
  const t = window.__t;
  const markdown = window.__probeDoc;
  const rounds = 8;
  const times = [];
  const sizes = [];
  for (let round = 0; round < rounds; round += 1) {
    const started = performance.now();
    await t.load(markdown);
    times.push(Math.round(performance.now() - started));
    // What the page accumulates, if anything: a load that leaves a root, a caret or a
    // block behind would show up here before it shows up in the times.
    sizes.push({
      mounted: t.blocks().length,
      roots: document.querySelectorAll('.prose').length,
      carets: document.querySelectorAll('.markdown-caret').length,
      scrollers: document.querySelectorAll('.markdown-scroller').length
    });
  }
  // The pure half, for attribution: splitting and parsing the same document in a fresh
  // state, with no renderer and no page involved.
  const { MarkdownEditorState } = await t.app('/src/ui/markdown/document/state.ts');
  const pure = [];
  for (let round = 0; round < 3; round += 1) {
    const started = performance.now();
    const state = new MarkdownEditorState(markdown);
    const block = state.getBlockAtOffset(0);
    if (block) {
      state.getBlockContent(block);
    }
    pure.push(Math.round(performance.now() - started));
  }
  return {
    documents: {
      characters: markdown.length,
      blocks: t.blocks().length
    },
    loadMs: times,
    loadMedian: times.slice().sort((a, b) => a - b)[Math.floor(rounds / 2)],
    loadGrowth: times[rounds - 1] - times[0],
    parseMs: pure,
    sizes
  };
})()
