/**
 * What a keystroke costs at the end of a document, timed one at a time, with the blocks
 * the edit rebuilt and the elements that survived beside them.
 *
 * The point of the phase, as a number: an edit does not cost what the document costs.
 * Run the probe against the two ends of the range — `probe:all` gives it the 323 KB
 * fixture note, `--fixture default-document.md` gives it the 2 KB demo document — and the
 * numbers are the comparison.
 *
 * The round is bounded by the clock, not by a count of characters. The bridge gives one
 * script five seconds, and what a keystroke at the end of this note costs is not a
 * constant: measured at 54 ms and at 979 ms inside one pass of ten, because the window the
 * renderer mounts moves and grows under the edit (24 blocks before a keystroke, 57 after
 * it, 484 in the pass that cost the most). So the probe types for as long as it is allowed
 * to and reports every step it took, with how many that was — a round that fits whatever
 * the window and the document are. The same text with a thousand footnote definitions
 * pasted at the end of it — the document where a label scan per keystroke would show — is
 * `edit-cost-notes.js`: held together the two outlived the budget (measured: the pass
 * below alone took 5 019 ms once the note's own last block was the one being rebuilt).
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
 *     test/probes/edit-cost.js
 *   npm run probe -- --fixture default-document.md test/probes/edit-cost.js
 */
(async () => {
  const t = window.__t;
  const out = t.report({});
  /**
   * How long the round types for, in wall clock: the probe's own share of the bridge's
   * five seconds, after the document the harness loads and the walk to the caret.
   * Measured at 1 200: the probe as a whole is 3 000–3 700 ms whatever the window mounts —
   * a keystroke can cost a second, so the round's last one can overshoot the budget by
   * that much — and the round still gets tens of keystrokes where they are cheap and
   * three or four where they are not.
   */
  const budgetMs = 1200;
  /** A cap, so a document whose keystrokes are free still ends. */
  const maxKeystrokes = 50;
  const round = (value) => Math.round(value * 100) / 100;

  /** Walks to the end of the document and puts the caret after the last character. */
  const caretAtTheEnd = async () => {
    const scroller = t.scroller();
    scroller.scrollTop = scroller.scrollHeight;
    await t.sleep(500);
    const block = t.blocks()[t.blocks().length - 1];
    const node = block ? t.textNodesIn(block).pop() : null;
    if (!node) {
      return false;
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
    return true;
  };

  /**
   * Types `character` at the end of the document until `budgetMs` have gone by, timing
   * each keystroke, and reports how many it got and how long it typed for.
   */
  const typeAtTheEnd = async (character) => {
    if (!(await caretAtTheEnd())) {
      return null;
    }
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
    // keystrokes went where the caret was put, not into whatever was focused.
    // Its size is here because it is part of the reading: the edit rebuilds the
    // block it lands in, and a note that ends in one enormous paragraph pays for
    // that block rather than for the document (see the phase's non-goal).
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

  out.given = summarise('the document as it loaded', await typeAtTheEnd('x'));
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
