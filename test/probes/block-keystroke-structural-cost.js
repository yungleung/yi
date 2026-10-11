/**
 * What a keystroke the editor answers by rendering the block costs — the ordinary path.
 *
 * An asterisk is not a character markdown reads as itself: it opens emphasis, so the
 * parse could change and the write-into-the-text-node path refuses it. The editor
 * renders the block instead, and the number here is what that costs — measured from the
 * same kind of caret the fast path is measured at in `block-keystroke-cost.js`, which is
 * the number this one exists to be compared with. What the block's own rebuild costs
 * when no keystroke is in the way is `block-rebuild-cost.js`.
 *
 * Three rounds, not the six the probe held before it was split: a round costs ~0.4 s on
 * the fixture note's last block, so six is 3.3 s of the bridge's five seconds (measured)
 * and the median is the number the phase reads. The caret is found the way the fast
 * path's is and read back afterwards, so the render measured is the keystroke's and not
 * the caret's arrival.
 *
 * Runs against the document the runner was given — the 323 KB fixture note under
 * `probe:all`, the demo document by name.
 *
 * @covers src/ui/markdown/editing/typed_text.ts, src/ui/markdown/virtual_block_renderer.ts
 * @needs-large-document — run against the 323 KB fixture note.
 *
 * Run with:
 *   npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" \
 *     test/probes/block-keystroke-structural-cost.js
 *   npm run probe -- --fixture default-document.md test/probes/block-keystroke-structural-cost.js
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const out = t.report({});
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const round = (value) => Math.round(value * 100) / 100;

  /**
   * The runs of letters in this block's *own* text, in the order they are tried: latest
   * first, and ahead of the rest the ones a space is prose in — a run that ends the line,
   * or that punctuation follows, is a place the space's own guard refuses.
   *
   * Only a text node that is the only child of its `[data-text-from]` span holds the
   * document's characters one for one, which is what the plain write needs to accept the
   * caret (`editing/typed_text.ts: plainRun`); a run of letters in a citation's formatted
   * reference or a link's title is *drawn* text, and the rule refuses there. Guessing at
   * every run of letters on screen cost the search three attempts and a re-render each
   * (measured: 3.4 s of a five-second budget), so the runs are looked up, not guessed —
   * and the one that is kept is still tried by typing.
   */
  const candidateAt = (block, index) => {
    if (!block) {
      return null;
    }
    const runs = [];
    for (const node of t.textNodesIn(block)) {
      const span = node.parentElement?.closest('[data-text-from]');
      if (!span || span.childNodes.length !== 1) {
        continue;
      }
      for (const match of node.data.matchAll(/[A-Za-z]{4,}/g)) {
        runs.push({
          node,
          offset: match.index + 2,
          endsWord: node.data[match.index + match[0].length] === ' '
        });
      }
    }
    const words = runs.filter((run) => run.endsWord).reverse();
    const rest = runs.filter((run) => !run.endsWord).reverse();
    return [...words, ...rest][index] ?? null;
  };

  /**
   * Types the cycle of `keys` `count` times at the caret, timing the *last* key of
   * each round and counting the reads it makes — the same measurement
   * `block-keystroke-cost.js` makes of the fast path's keys, so the two reports read
   * as one. `settle` waits out the deferred check a burst's end schedules, so the next
   * round is not timed over it; the last round has nothing after it and does not pay
   * for one.
   */
  const timeKeystrokes = async (keys, count, label, { settle = true } = {}) => {
    const element = t.blocks().find((candidate) => Number(candidate.dataset.lineStart) === lineStart);
    const rects = Element.prototype.getBoundingClientRect;
    const heights = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    const times = [];
    const reads = { rect: 0, height: 0 };
    const timed = keys[keys.length - 1];
    /** Counts the geometry reads one timed keystroke makes, and only those. */
    const measure = (build) => {
      reads.rect = 0;
      reads.height = 0;
      Element.prototype.getBoundingClientRect = function () {
        reads.rect += 1;
        return rects.call(this);
      };
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() {
          reads.height += 1;
          return heights.get.call(this);
        }
      });
      try {
        build();
      } finally {
        Element.prototype.getBoundingClientRect = rects;
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', heights);
      }
      return { rect: reads.rect, height: reads.height };
    };
    try {
      for (let index = 0; index < count; index += 1) {
        for (const key of keys) {
          if (key !== timed) {
            t.key(key);
            continue;
          }
          let read = { rect: 0, height: 0 };
          const started = performance.now();
          read = measure(() => t.key(key));
          times.push(performance.now() - started);
          reads.total = (reads.total ?? 0) + read.rect;
          reads.heightTotal = (reads.heightTotal ?? 0) + read.height;
        }
      }
    } finally {
      Element.prototype.getBoundingClientRect = rects;
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', heights);
    }
    if (settle) {
      await t.sleep(300);
    }
    return {
      medianMs: round(median(times)),
      path: t.blocks().includes(element) ? 'fast' : 'ordinary',
      reads: {
        rects: round((reads.total ?? 0) / count),
        offsetHeight: round((reads.heightTotal ?? 0) / count)
      },
      label
    };
  };

  // Scrolling has to converge before anything is clicked: blocks are measured as they are
  // mounted, so one jump to `scrollHeight` lands where the estimates said the end was, not
  // where it is. The loop stops once the scroller is at its bottom and reports how many
  // steps that took (measured: two).
  const scroller = t.scroller();
  let scrollSteps = 0;
  for (; scrollSteps < 8; scrollSteps += 1) {
    scroller.scrollTop = scroller.scrollHeight;
    await t.sleep(300);
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
      break;
    }
  }
  out.atBottom = {
    steps: scrollSteps,
    scrollTop: Math.round(scroller.scrollTop),
    scrollHeight: Math.round(scroller.scrollHeight),
    clientHeight: Math.round(scroller.clientHeight)
  };
  // The caret goes inside a word of the last block's own text: a letter typed between
  // letters is written, so the block survives a keystroke that stays inline — which is
  // what makes the asterisk typed from here the render being measured.
  const last = t.blocks()[t.blocks().length - 1];
  const lineStart = Number(last?.dataset.lineStart);
  /**
   * Puts the caret on a run of letters where a typed letter keeps the block, and says
   * which run it was, counting from the end of the list of candidates above. A candidate
   * is tried by typing a letter, and then a space, and kept when the block survived both.
   */
  const findSpot = async () => {
    let block = last;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const spot = candidateAt(block, attempt);
      if (!spot) {
        return null;
      }
      const caret = document.createRange();
      caret.setStart(spot.node, spot.offset);
      caret.collapse(true);
      const caretBox = caret.getBoundingClientRect();
      spot.node.parentElement.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          clientX: caretBox.left,
          clientY: caretBox.top + caretBox.height / 2
        })
      );
      await t.sleep(120);
      t.key('y');
      await t.sleep(150);
      if (!t.blocks().includes(block)) {
        block =
          t.blocks().find((element) => Number(element.dataset.lineStart) === lineStart) ?? block;
        continue;
      }
      t.key(' ');
      await t.sleep(150);
      if (t.blocks().includes(block)) {
        return attempt;
      }
      block =
        t.blocks().find((element) => Number(element.dataset.lineStart) === lineStart) ?? block;
    }
    return null;
  };
  const caretRun = await findSpot();
  if (caretRun === null) {
    return { error: 'no word to put the caret in' };
  }
  out.caretRun = caretRun;
  // Where the caret is, as the app's own caret has it: the round below is only a
  // measurement of the ordinary path if the keystroke lands in the block.
  const placed = caretModule.getCaretRange();
  out.caret = placed
    ? {
        block: Number(
          placed.startContainer.parentElement?.closest('.markdown-block')?.dataset.lineStart
        ),
        offset: placed.startOffset
      }
    : null;
  const structural = await timeKeystrokes(['*'], 3, 'an asterisk', { settle: false });
  out.medianMs = { structuralKeystroke: structural.medianMs };
  out.keystrokePath = { structural: structural.path };
  out.perKeystrokeReads = { structural: structural.reads };
  out.keystrokes = { structural };
  return out;
})()
