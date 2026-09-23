/**
 * What rebuilding the block a keystroke lands in costs, against patching the text
 * node that keystroke changed.
 *
 * The pair of numbers is the next phase's reason: building a block's DOM is cheap,
 * replacing it in the page is not, and the layout that replacement invalidates is
 * what the next geometry read pays for. Runs against the document the runner was
 * given — the 323 KB fixture note under `probe:all`, the demo document by name —
 * and the app's own keystrokes are measured with the geometry reads they make
 * counted: a letter typed inside a word and the space between two words, which the
 * fast path writes into the text node, and a full stop, which the ordinary path
 * renders the block for. Which of the two the editor pays for is the phase's whole
 * question, so all three are reported.
 *
 * @covers src/ui/markdown/virtual_block_renderer.ts, src/ui/markdown/create_block.ts
 * @needs-large-document — run against the 323 KB fixture note.
 *
 * Run with:
 *   npm run probe -- --fixture "notes/Western Philosophy/Hannah Arendt/The Human Condition.md" \
 *     test/probes/block-rebuild-cost.js
 *   npm run probe -- --fixture default-document.md test/probes/block-rebuild-cost.js
 */
(async () => {
  const t = window.__t;
  const { MarkdownEditorState } = await t.app('/src/ui/markdown/document/state.ts');
  const { splitBlocks } = await t.app('/src/ui/markdown/document/blocks.ts');
  const { createBlockComponent } = await t.app('/src/ui/markdown/create_block.ts');
  const out = t.report({});
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const round = (value) => Math.round(value * 100) / 100;

  /**
   * The `index`-th last run of letters in this block, as a position inside it, or
   * null when the block has fewer runs than that. Letters are what the plain-edit
   * rule accepts, and a caret between them is a place where a typed letter cannot
   * open or close anything — which is what makes the keystrokes measured from
   * there the fast path's.
   */
  const letterRun = (block, index) => {
    if (!block) {
      return null;
    }
    const nodes = t.textNodesIn(block);
    const runs = [];
    for (const node of nodes) {
      for (const run of node.data.matchAll(/[A-Za-z]{4,}/g)) {
        runs.push({ node, offset: run.index + 2 });
      }
    }
    return runs[runs.length - 1 - index] ?? null;
  };

  /**
   * Types the cycle of `keys` `count` times at the caret, timing the *last* key of
   * each round and counting the reads it makes. The keys before it are the setup a
   * keystroke needs to stay the fast path's: a space is only prose when a letter is
   * on its left, so the space's round types a letter first.
   */
  const timeKeystrokes = async (keys, count, label) => {
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
    await t.sleep(300);
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

  // The app's own keystroke first, and the document after it: reading the whole
  // text is the bridge's slow path, so it comes once the page has been driven.
  // Scrolling has to converge before anything is clicked: blocks are measured as
  // they are mounted, so one jump to `scrollHeight` lands where the estimates said
  // the end was, not where it is.
  const scroller = t.scroller();
  for (let step = 0; step < 6; step += 1) {
    scroller.scrollTop = scroller.scrollHeight;
    await t.sleep(300);
  }
  // The caret goes inside a word of the last block's own text. That is where the
  // fast path applies — a letter typed between letters cannot change how the text
  // parses — and the pair of numbers below is measured from there: the plain
  // keystroke that path is for, and the structural one it hands to the ordinary
  // path. (At the end of the last line, where this probe used to put the caret,
  // the rule refuses, and the keystrokes measured the ordinary path twice over.)
  const last = t.blocks()[t.blocks().length - 1];
  const lineStart = Number(last?.dataset.lineStart);
  /**
   * Puts the caret on a run of letters where a typed letter keeps the block, and
   * says which run it was. Not every run of letters on screen is a word of the
   * document: a citation's formatted reference and a link's title are rendered
   * text, and the rule — correctly — refuses there; nor is every word a place a
   * space is prose (a run with punctuation or a URL after it is not). So a candidate
   * is tried by typing a letter, and then a space, and kept when the block survived
   * both.
   */
  const findSpot = async () => {
    let block = last;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const spot = letterRun(block, attempt);
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
  const plain = await timeKeystrokes(['x'], 10, 'a letter inside a word');
  const space = await timeKeystrokes(['y', ' '], 6, 'a space between two words');
  const structural = await timeKeystrokes(['.'], 6, 'a full stop');
  // Reported before the parse and build measurements, so a bridge that gives up on
  // this note still has the numbers the probe exists for.
  out.medianMs = {
    plainKeystroke: plain.medianMs,
    spaceKeystroke: space.medianMs,
    structuralKeystroke: structural.medianMs
  };
  out.keystrokePath = { plain: plain.path, space: space.path, structural: structural.path };
  out.perKeystrokeReads = {
    plain: plain.reads,
    space: space.reads,
    structural: structural.reads
  };
  out.keystrokes = { plain, space, structural };
  t.report(out);

  const text = await t.raw();
  const blocks = splitBlocks(text);
  const block =
    blocks.find((candidate) => candidate.lineStart === lineStart) ?? blocks[blocks.length - 1];
  const state = new MarkdownEditorState(text);
  const children = state.getBlockContent(block);
  // The live element the keystrokes landed in — the block itself was replaced
  // under them, which is the behaviour this probe is about.
  const element = t.blocks()[t.blocks().length - 1];
  out.block = {
    kind: block.kind,
    characters: block.text.length,
    lines: block.text.split('\n').length,
    elements: element ? element.querySelectorAll('*').length : 0
  };
  /** Which run of letters the caret went to, latest first: 0 is the last one. */
  out.caretRun = caretRun;

  const parse = [];
  const build = [];
  for (let index = 0; index < 12; index += 1) {
    const startedParse = performance.now();
    const fresh = new MarkdownEditorState(text);
    fresh.getBlockContent(block);
    parse.push(performance.now() - startedParse);

    const startedBuild = performance.now();
    createBlockComponent({ ...block, type: 'block' }, children);
    build.push(performance.now() - startedBuild);
  }

  // Rebuilding it, as the renderer does today: build, replace, force layout.
  const rebuild = [];
  for (let index = 0; index < 6; index += 1) {
    const started = performance.now();
    const fresh = createBlockComponent({ ...block, type: 'block' }, children).element;
    element.replaceWith(fresh);
    fresh.getBoundingClientRect();
    rebuild.push(performance.now() - started);
    fresh.replaceWith(element);
    element.getBoundingClientRect();
  }

  // Patching what a keystroke changes: one text node inside it.
  const nodes = t.textNodesIn(element);
  const node = nodes[Math.floor(nodes.length / 2)];
  const original = node.data;
  const patch = [];
  for (let index = 0; index < 6; index += 1) {
    const started = performance.now();
    node.data = `${original.slice(0, original.length - 1)}x`;
    element.getBoundingClientRect();
    patch.push(performance.now() - started);
    node.data = original;
    element.getBoundingClientRect();
  }

  out.medianMs = {
    blockParse: round(median(parse)),
    buildDetachedDom: round(median(build)),
    rebuildBlockAndForceLayout: round(median(rebuild)),
    patchTextNodeAndForceLayout: round(median(patch)),
    plainKeystroke: plain.medianMs,
    spaceKeystroke: space.medianMs,
    structuralKeystroke: structural.medianMs
  };
  return out;
})()
