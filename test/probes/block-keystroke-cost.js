/**
 * What a keystroke the editor can write into the text node it landed in costs — the
 * fast path, and the geometry reads it makes.
 *
 * A letter typed inside a word, the space between two words and a full stop are all
 * characters markdown reads as themselves in a place none of them can open a construct,
 * so each is written into the text node the caret is in and nothing is rendered. The
 * keystrokes the editor *cannot* write that way — an asterisk, which renders the block —
 * are `block-keystroke-structural-cost.js`, and what the block itself costs to parse,
 * build and replace is `block-rebuild-cost.js`: held together in one probe the rounds
 * outlived the bridge's five seconds (measured: 5 020 ms, cut off between them — the
 * asterisk's own six rounds are 3.3 s of that).
 *
 * Runs against the document the runner was given — the 323 KB fixture note under
 * `probe:all`, the demo document by name — and the caret goes into a word of the last
 * block's own text: a letter typed between letters cannot change how the text parses.
 *
 * @covers src/ui/markdown/editing/typed_text.ts, src/ui/markdown/virtual_block_renderer.ts
 * @needs-large-document — run against the 323 KB fixture note.
 *
 * Run with:
 *   npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" \
 *     test/probes/block-keystroke-cost.js
 *   npm run probe -- --fixture default-document.md test/probes/block-keystroke-cost.js
 */
(async () => {
  const t = window.__t;
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
   * each round and counting the reads it makes. The keys before it are the setup a
   * keystroke needs to stay the fast path's: a space is only prose when a letter is
   * on its left, so the space's round types a letter first. `settle` waits out the
   * deferred check a burst's end schedules, so the next round is not timed over it;
   * the last round has nothing after it and does not pay for one.
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
  // The caret goes inside a word of the last block's own text. That is where the fast path
  // applies — a letter typed between letters cannot change how the text parses — and the
  // rounds below are measured from there.
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
  // Every round is reported as it is measured, so a round that is cut off still leaves
  // the ones before it in the stash.
  const rounds = {};
  const publish = () => {
    out.medianMs = Object.fromEntries(
      Object.entries(rounds).map(([name, result]) => [`${name}Keystroke`, result.medianMs])
    );
    out.keystrokePath = Object.fromEntries(
      Object.entries(rounds).map(([name, result]) => [name, result.path])
    );
    out.perKeystrokeReads = Object.fromEntries(
      Object.entries(rounds).map(([name, result]) => [name, result.reads])
    );
    out.keystrokes = { ...rounds };
    t.report(out);
  };
  rounds.plain = await timeKeystrokes(['x'], 10, 'a letter inside a word');
  publish();
  rounds.space = await timeKeystrokes(['y', ' '], 6, 'a space between two words');
  publish();
  // A letter first: the probe times the *last* key of the cycle, and a full stop is
  // prose with a letter on its left.
  rounds.fullStop = await timeKeystrokes(['z', '.'], 6, 'a full stop', { settle: false });
  publish();
  return out;
})()
