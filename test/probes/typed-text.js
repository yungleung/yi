/**
 * Typing into a paragraph: what does not render, and the seams where it does.
 *
 * A printable keystroke that maps exactly into the text node under the caret is
 * written there immediately, even when a marker could later change the parse. The
 * block and text node survive the burst; `syntax/plain_edit.ts` identifies the
 * smaller set already known not to change the parse, and other writes are checked
 * once after typing settles.
 *
 * The rest of the probe is the seams on either side of that rule:
 *
 * - a selection spanning two text nodes is no write into one node, and an edit at
 *   a line edge can change what the line is, so both go the ordinary way;
 * - a caret inside a link's shown source is written in place through the same exact
 *   text mapping;
 * - typing that makes the block taller re-measures it, so the heights the spacers
 *   are built from still add up to the page;
 * - and the deferred check behind all of it: a burst of typing captures the
 *   block's parse shape once (not once a keystroke) and checks it when the typing
 *   stops, rendering the block again if the parse moved after all.
 *
 * Where those writes leave the block's offsets — the caret later in the same block
 * — is `test/probes/plain-edit-offsets.js`.
 *
 * @covers src/ui/markdown/editing/typed_text.ts, src/ui/markdown/editing/context.ts
 */
(async () => {
  const t = window.__t;
  const out = t.report({});
  const failures = [];
  /** Records one expectation of a case, naming it when it does not hold. */
  const check = (name, holds) => {
    if (!holds) {
      failures.push(name);
    }
  };

  /** The documents the cases type into: each is loaded on its own. */
  const paragraph = 'A paragraph with fairly plain words in it.\n\nsecond\n';
  const linked = 'A paragraph with a [ the title ](https://example.com) in it.\n\nsecond\n';
  const emphasised = 'A paragraph with *emphasised* words in it.\n\nsecond\n';
  const twoLines = 'A paragraph that runs\nover two lines.\n\nsecond\n';
  /**
   * A document taller than the window, so the spacers stand for blocks that are
   * not mounted: typing into the first paragraph makes it — and the page — taller
   * without the spacer below moving, which is the arithmetic this case reads.
   */
  const fillers = Array.from(
    { length: 60 },
    (_, index) => `Filler paragraph number ${index}, with enough words in it to wrap over two lines.`
  ).join('\n\n');
  const roomy = `A short paragraph with a line of fairly plain words in it.\n\n${fillers}\n`;

  /**
   * What the page is worth in pixels: the two spacers, the blocks mounted between
   * them, and the scroll height the browser lays out from the two.
   */
  const page = () => {
    const spacers = [...t.prose().querySelectorAll('[data-virtual-spacer]')].reduce(
      (sum, spacer) => sum + spacer.getBoundingClientRect().height,
      0
    );
    const blocks = t
      .blocks()
      .reduce((sum, block) => sum + block.getBoundingClientRect().height, 0);
    return {
      spacers: Math.round(spacers),
      blocks: Math.round(blocks),
      height: Math.round(t.scroller().scrollHeight)
    };
  };

  /** Whether a block wears the height the renderer remembers it by. */
  const remembered = (element) => {
    const tag = /auto (\d+(?:\.\d+)?)px/.exec(element?.style.containIntrinsicSize ?? '');
    return tag !== null && Math.abs(Number(tag[1]) - element.getBoundingClientRect().height) < 1.5;
  };

  /** Waits until the window has settled at the top of the document. */
  const scrollToTop = async () => {
    for (let step = 0; step < 2; step += 1) {
      t.scroller().scrollTop = 0;
      await t.sleep(150);
    }
  };

  /**
   * Whether the block a case typed into shows the document's own characters. The
   * cases type into the first block, so its rendering has to be the document up
   * to the blank line that ends it — the same characters, in the same order, with
   * nothing of the block left out and nothing added.
   */
  const showsDocument = (measurement) =>
    measurement.expected.startsWith(`${measurement.text.replace(/\u00a0/g, ' ')}\n`);

  /**
   * Types `keys` at a caret `place` puts in the rendering of `text`, and reports
   * what they did: whether the block and the text node the caret was in survived
   * (the fast path) or were built again (the ordinary path), the geometry reads
   * they made, and whether the document holds exactly what they stand for.
   *
   * `place` gets the document as it loaded, and returns the block to watch, the
   * text node to put the caret in with the offset inside it — or, for a selection,
   * the `range` to select — and the document range the keystrokes replace.
   *
   * What the keystrokes did is read from the block they landed in, which is what
   * the reader sees; `checkDocument` also reads the whole document back through
   * the clipboard, which is the bridge's slow path and only worth its time where
   * the document itself is the claim (the fast path writes into the DOM without
   * rendering, so its text is what has to be proved).
   */
  const typeAt = async (text, place, keys, inserted = keys.join(''), checkDocument = false) => {
    const caseStarted = performance.now();
    await t.load(text);
    if (text === roomy) {
      await scrollToTop();
    }
    const target = await place(text);
    if (!target) {
      return { error: 'no text to put the caret in' };
    }
    if (target.range) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(target.range);
    } else {
      const caret = document.createRange();
      caret.setStart(target.node, target.at);
      caret.collapse(true);
      const box = caret.getBoundingClientRect();
      target.node.parentElement.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          clientX: box.left,
          clientY: box.top + box.height / 2
        })
      );
    }
    await t.sleep(100);
    const before = {
      block: target.block,
      node: target.node,
      blockHeight: target.block.getBoundingClientRect().height,
      page: page()
    };
    // The keystrokes' own cost, and the geometry reads they make: the fast path
    // should not read a rect at all, and the only thing it measures is the height
    // of the block it wrote into (`measureEditedBlock`).
    const reads = { rects: 0, heights: 0 };
    const rects = Element.prototype.getBoundingClientRect;
    const heights = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Element.prototype.getBoundingClientRect = function () {
      reads.rects += 1;
      return rects.call(this);
    };
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        reads.heights += 1;
        return heights.get.call(this);
      }
    });
    const started = performance.now();
    for (const key of keys) {
      t.key(key);
    }
    const ms = performance.now() - started;
    Element.prototype.getBoundingClientRect = rects;
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', heights);
    await t.sleep(220);
    const to = target.to ?? target.from;
    const after = t.blocks().find((element) => element.lineStart === before.block.lineStart);
    const measured = page();
    const expected = `${text.slice(0, target.from)}${inserted}${text.slice(to)}`;
    return {
      caseMs: Math.round(performance.now() - caseStarted),
      expected,
      text: after ? after.textContent : '',
      document: checkDocument ? (await t.raw()) === expected : null,
      blockSurvived: after === before.block,
      textNodeSurvived: after ? t.textNodesIn(after).includes(before.node) : false,
      shownSource: t.prose().querySelector('.markdown-source-view')?.textContent ?? null,
      blockGrowth: after ? Math.round(after.getBoundingClientRect().height - before.blockHeight) : 0,
      pageGrowth: measured.height - before.page.height,
      spacerGrowth: measured.spacers - before.page.spacers,
      remembered: after ? remembered(after) : false,
      ms: Math.round(ms * 10) / 10,
      reads
    };
  };

  /** A caret `inside` characters into `needle`, and where that is in the document. */
  const inWord = (needle, inside) => (text) => {
    const block = t.blocks().find((element) => element.textContent.includes(needle));
    const node = block ? t.textNodesIn(block).find((leaf) => leaf.data.includes(needle)) : null;
    if (!block || !node) {
      return null;
    }
    const from = text.indexOf(needle) + inside;
    return { block, node, at: node.data.indexOf(needle) + inside, from, to: from };
  };

  // Straight typing: the block, its text node and the page's layout all stay put.
  out.plainLetter = await typeAt(paragraph, inWord('fairly', 3), ['y'], 'y', true);
  check('a plain letter keeps the block', out.plainLetter.blockSurvived);
  check('a plain letter keeps the text node', out.plainLetter.textNodeSurvived);
  check('a plain letter reaches the document', showsDocument(out.plainLetter));
  check('a plain letter is in the document', out.plainLetter.document);
  check('a plain letter moves nothing', out.plainLetter.blockGrowth === 0);
  check('a plain letter reads no rect', out.plainLetter.reads.rects === 0);
  check('a plain letter measures only its block', out.plainLetter.reads.heights === 1);

  out.plainLetterRun = await typeAt(paragraph, inWord('plain', 2), ['z', 'z']);
  check('a run of letters keeps the block', out.plainLetterRun.blockSurvived);
  check('a run of letters reaches the document', showsDocument(out.plainLetterRun));

  // A marker that could change the parse is still written in place during the
  // burst; only the deferred shape check may replace the block afterwards.
  out.markerAsterisk = await typeAt(paragraph, inWord('plain', 2), ['*']);
  check('an asterisk keeps the block while it is typed', out.markerAsterisk.blockSurvived);
  check('an asterisk keeps the text node', out.markerAsterisk.textNodeSurvived);
  check('an asterisk reaches the document', showsDocument(out.markerAsterisk));

  out.plainSpace = await typeAt(paragraph, inWord('plain', 2), [' ']);
  check('a space keeps the block', out.plainSpace.blockSurvived);
  check('a space keeps the text node', out.plainSpace.textNodeSurvived);
  check('a space reaches the document', showsDocument(out.plainSpace));
  check('a space reads no rect', out.plainSpace.reads.rects === 0);

  // The punctuation of a sentence is prose: a full stop and a comma in one burst are
  // written the way a letter is. (One case rather than two, because this probe sits at
  // the bridge's budget on a long-running app — see the note at the end of it.)
  out.plainPunctuation = await typeAt(paragraph, inWord('plain', 2), ['.', ',']);
  check('punctuation keeps the block', out.plainPunctuation.blockSurvived);
  check('punctuation keeps the text node', out.plainPunctuation.textNodeSurvived);
  check('punctuation reaches the document', showsDocument(out.plainPunctuation));
  check('punctuation reads no rect', out.plainPunctuation.reads.rects === 0);

  // A selection over more than one node: two ends, so no single node to write into.
  out.selectionAcrossNodes = await typeAt(
    emphasised,
    (text) => {
      const block = t.blocks().find((element) => element.textContent.includes('emphasised'));
      const leaves = block ? t.textNodesIn(block) : [];
      const first = leaves.find((leaf) => leaf.data.includes('with'));
      const last = leaves.find((leaf) => leaf.data.includes('words'));
      if (!first || !last) {
        return null;
      }
      const range = document.createRange();
      range.setStart(first, first.data.length - 1);
      range.setEnd(last, 3);
      return {
        block,
        node: first,
        at: first.data.length - 1,
        range,
        from: text.indexOf('with') + 4,
        to: text.indexOf('words') + 2
      };
    },
    ['q']
  );
  check('a selection across nodes rebuilds the block', !out.selectionAcrossNodes.blockSurvived);
  check('a selection across nodes replaces the document range', showsDocument(out.selectionAcrossNodes));

  // An edit at a line edge: joining two lines is one deletion, not a plain one.
  out.lineJoin = await typeAt(
    twoLines,
    (text) => {
      const block = t.blocks()[0];
      const node = block ? t.textNodesIn(block).find((leaf) => leaf.data.includes('over')) : null;
      if (!block || !node) {
        return null;
      }
      return {
        block,
        node,
        at: node.data.indexOf('over'),
        from: text.indexOf('over') - 1,
        to: text.indexOf('over')
      };
    },
    ['Backspace'],
    ''
  );
  check('an edit that joins two lines rebuilds the block', !out.lineJoin.blockSurvived);
  check('an edit that joins two lines takes the newline with it', showsDocument(out.lineJoin));

  // A caret inside a link's shown source: the source tag names the block-relative
  // start of the text on screen, so the same local write applies to the node under
  // the caret and the source view stays mounted.
  out.shownSource = await typeAt(
    linked,
    async (text) => {
      const anchor = t.prose().querySelector('a.markdown-link');
      if (!anchor) {
        return null;
      }
      await t.click(anchor, 0.5);
      await t.sleep(300);
      const shown = t.prose().querySelector('.markdown-source-view');
      const node = shown ? t.textNodesIn(shown)[0] : null;
      const block = t.blocks().find((element) => element.contains(shown));
      if (!shown || !node || !block) {
        return null;
      }
      return {
        block,
        node,
        at: node.data.indexOf('title') + 2,
        from: text.indexOf('title') + 2,
        to: text.indexOf('title') + 2
      };
    },
    ['x', 'y']
  );
  check('typing in a shown source keeps the block', out.shownSource.blockSurvived);
  check('typing in a shown source keeps its text node', out.shownSource.textNodeSurvived);
  check('typing in a shown source lands where the caret is', showsDocument(out.shownSource));
  check(
    'typing in a shown source shows the source it now has',
    out.shownSource.shownSource === '[ the tixytle ](https://example.com)'
  );

  // Typing that grows the block: the renderer has to re-measure it, so the heights
  // the spacers are built from still add up to the page.
  out.growingBlock = await typeAt(roomy, inWord('fairly', 3), Array(100).fill('x'), undefined, true);
  check('a growing block is still the fast path', out.growingBlock.blockSurvived);
  check('a growing block keeps its text node', out.growingBlock.textNodeSurvived);
  check('a growing block reaches the document', showsDocument(out.growingBlock));
  check('a growing block is in the document', out.growingBlock.document);
  check('a growing block grows itself', out.growingBlock.blockGrowth >= 24);
  check('a growing block grows the page with it', out.growingBlock.pageGrowth === out.growingBlock.blockGrowth);
  check('a growing block does not grow the spacer', out.growingBlock.spacerGrowth === 0);
  check('a growing block is remembered at its new height', out.growingBlock.remembered);

  out.failed = failures;
  t.report(out);

  // The deferred check: the shape of the block's parse is captured once a burst —
  // not once a keystroke — and compared with the parse the block has once the
  // typing stops. Nothing the rule accepts can change a parse (that is the
  // property in `test/checks/check-plain-edit.mjs`), so the probe stages the case
  // the check exists for: the check is answered with a shape the block does not
  // have, and the block has to be rendered again — in place, with the caret, so
  // that typing continues in the paragraph it came from.
  const { MarkdownEditorState } = await t.app('/src/ui/markdown/document/state.ts');
  const { VirtualBlockRenderer } = await t.app('/src/ui/markdown/virtual_block_renderer.ts');
  const calls = { capture: 0, check: 0 };
  const renders = [];
  let staged = true;
  const originalContent = MarkdownEditorState.prototype.getBlockContent;
  const originalRender = VirtualBlockRenderer.prototype.renderBlock;
  MarkdownEditorState.prototype.getBlockContent = function (block) {
    const stack = String(new Error().stack ?? '');
    if (stack.includes('scheduleEditVerification')) {
      calls.capture += 1;
    } else if (stack.includes('verifyBlock') && !stack.includes('renderBlock')) {
      calls.check += 1;
      if (staged) {
        staged = false;
        return [{ type: 'staged' }];
      }
    }
    return originalContent.call(this, block);
  };
  VirtualBlockRenderer.prototype.renderBlock = function (lineStart) {
    renders.push(lineStart);
    return originalRender.call(this, lineStart);
  };
  let bursts = [];
  let healed = { renders: 0, renderedText: '', caretStayed: false };
  try {
    await t.load(paragraph);
    const target = inWord('fairly', 3)(paragraph);
    const caret = document.createRange();
    caret.setStart(target.node, target.at);
    caret.collapse(true);
    const box = caret.getBoundingClientRect();
    target.node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left,
        clientY: box.top + box.height / 2
      })
    );
    await t.sleep(150);
    // Two bursts, far enough apart that the first has been checked before the
    // second starts: one capture and one check each, whatever their number of
    // keystrokes.
    for (const keys of [
      ['w', 'w', 'w'],
      ['v', 'v']
    ]) {
      const mark = { ...calls };
      for (const key of keys) {
        t.key(key);
      }
      await t.sleep(300);
      bursts.push({
        keystrokes: keys.length,
        captures: calls.capture - mark.capture,
        checks: calls.check - mark.check
      });
    }
    // One more keystroke, in the block the check rendered again: it lands where
    // the caret was, which is what says the block came back in place.
    t.key('u');
    await t.sleep(200);
    const block = t.blocks().find((element) => element.textContent.includes('fai'));
    healed = {
      renders: renders.length,
      // The block the caret is in, written into by every keystroke of the two
      // bursts and then by one more: the fast path's writes and the check's
      // re-render both left the same element in place to type into.
      rendered: block ? block.textContent : '',
      caretStayed: block ? block.textContent.includes('faiwwwvvu') : false
    };
  } finally {
    MarkdownEditorState.prototype.getBlockContent = originalContent;
    VirtualBlockRenderer.prototype.renderBlock = originalRender;
  }
  out.deferredCheck = { bursts, renders: renders.length, healed };
  t.report(out);
  check('a burst of typing is captured once', bursts.every((burst) => burst.captures === 1));
  check('a burst of typing is checked once', bursts.every((burst) => burst.checks === 1));
  check('a block whose parse moved is rendered again', healed.renders === 1);
  check('a block rendered again is still on the page', healed.rendered.startsWith('A paragraph with fai'));
  check('a block rendered again keeps the caret', healed.caretStayed);
  out.failed = failures;
  return out;
})()
