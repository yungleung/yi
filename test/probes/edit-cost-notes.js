/**
 * What a keystroke costs at the end of a note with a thousand footnote definitions in
 * it — the document where a label scan per keystroke would show.
 *
 * A thousand definitions are pasted at the end of the document the runner was given, one
 * definition per block (a blank line between them), so that the pass types into a
 * paragraph and a definition line and not into a thousand-line block whose re-parse would
 * be what the probe measured. The paste costs ~35 ms (measured, over the 500 ms wait that
 * follows it) and the last definition is what the caret is then in, which is the point:
 * a note full of notes is not a note whose edits cost more.
 *
 * The round is bounded by the clock, not by a count of characters — the bridge gives one
 * script five seconds, and the per-keystroke cost of a citation-bearing document is not a
 * constant — so the probe types for as long as it is allowed to and reports every step it
 * took, with how many that was. `edit-cost.js` is the other half of the comparison: the
 * same keystrokes in the document as it loaded.
 *
 * The timings need the editor window to be visible: an occluded webview throttles
 * animation frames, and every keystroke then reports `settled: false` instead of a time.
 * The rest of the report — what the edit rebuilt, what survived it — stands either way.
 *
 * @covers src/ui/markdown/document/state.ts, src/ui/markdown/document/blocks.ts
 * @needs-large-document — run against the 323 KB fixture note.
 *
 * Run with:
 *   npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" \
 *     test/probes/edit-cost-notes.js
 *   npm run probe -- --fixture default-document.md test/probes/edit-cost-notes.js
 */
(async () => {
  const t = window.__t;
  const out = t.report({});
  /**
   * How long the round types for, in wall clock: the probe's own share of the bridge's
   * five seconds, after the document the harness loads, the walk to the caret and the
   * paste. Measured at 1 200: the probe as a whole is 3 200–4 000 ms with the definitions
   * pasted into the fixture note — a keystroke can cost a second, so the round's last one
   * can overshoot the budget by that much — and the round still gets a handful of
   * keystrokes where the window is moving under them.
   */
  const budgetMs = 1200;
  /** A cap, so a document whose keystrokes are free still ends. */
  const maxKeystrokes = 50;
  /**
   * One definition per block, a blank line between them: the text a reader's own notes
   * folder is full of, and the shape a label scan per keystroke would show in.
   */
  const definitions = Array.from({ length: 1000 }, (_, index) => `[^n${index}]: note ${index}`).join(
    '\n\n'
  );
  const round = (value) => Math.round(value * 100) / 100;

  /** Pastes the definitions at the end of the document. */
  const pasteDefinitions = async () => {
    const scroller = t.scroller();
    scroller.scrollTop = scroller.scrollHeight;
    await t.sleep(500);
    const block = t.blocks()[t.blocks().length - 1];
    const node = block ? t.textNodesIn(block).pop() : null;
    if (!node) {
      return null;
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
    const started = performance.now();
    const data = new DataTransfer();
    data.setData('text/plain', `\n\n${definitions}`);
    t.scroller().dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    );
    const pasted = performance.now() - started;
    await t.sleep(500);
    return { pastedMs: Math.round(pasted * 100) / 100 };
  };

  /**
   * Types `character` at the end of the document until `budgetMs` have gone by, timing
   * each keystroke, and reports how many it got and how long it typed for.
   */
  const typeAtTheEnd = async (character) => {
    const steps = [];
    const startedTyping = performance.now();
    while (steps.length < maxKeystrokes && performance.now() - startedTyping < budgetMs) {
      const mounted = new Set(t.blocks());
      const started = performance.now();
      t.key(character);
      // The edit runs inside the keydown handler; `ms` carries on to the next
      // frame, which is when the change has been painted.
      const handled = performance.now() - started;
      const settled = await nextFrame();
      const elapsed = performance.now() - started;
      const after = t.blocks();
      steps.push({
        handled: round(handled),
        ms: round(elapsed),
        settled,
        mounted: after.length,
        rebuilt: after.filter((element) => !mounted.has(element)).length,
        survived: after.filter((element) => mounted.has(element)).length
      });
    }
    const typedForMs = Math.round(performance.now() - startedTyping);
    // The characters are in the document, in a block the renderer mounted: the
    // keystrokes went where the caret was put, not into whatever was focused. What the
    // block looks like is part of the reading — a note full of notes types into a
    // definition line, and that is the block the edit pays for.
    const block = t
      .blocks()
      .find((element) => element.textContent.includes(character.repeat(steps.length)));
    return {
      steps,
      typedForMs,
      typed: Boolean(block),
      typedBlock: block
        ? { lineStart: Number(block.dataset.lineStart), renderedCharacters: block.textContent.length }
        : null
    };
  };

  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)];
  };

  const summarise = (label, measured) => {
    if (!measured) {
      return { label, error: 'no block to put the caret in' };
    }
    const { steps, typed, typedBlock, typedForMs } = measured;
    return {
      label,
      typed,
      typedBlock,
      budgetMs,
      typedForMs,
      keystrokes: steps.length,
      medianMs: median(steps.map((step) => step.ms)),
      slowestMs: Math.max(...steps.map((step) => step.ms)),
      medianEditMs: round(median(steps.map((step) => step.handled))),
      slowestEditMs: Math.max(...steps.map((step) => step.handled)),
      rebuiltFirst: steps[0].rebuilt,
      rebuiltMedian: median(steps.slice(1).map((step) => step.rebuilt)),
      survivedMedian: median(steps.map((step) => step.survived)),
      settled: steps.every((step) => step.settled),
      mounted: steps[steps.length - 1].mounted,
      steps
    };
  };

  const pasted = await pasteDefinitions();
  if (pasted === null) {
    return { ...out, error: 'no block to put the caret in' };
  }
  out.notes = { definitions: 1000, ...pasted };
  out.thousandFootnotes = summarise('the same text with a thousand definitions pasted in', await typeAtTheEnd('y'));
  t.report(out);
  return out;

  /** The next animation frame, or a give-up if frames are throttled. */
  function nextFrame() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve(true));
      setTimeout(() => resolve(false), 500);
    });
  }
})()
