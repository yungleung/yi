/**
 * Typing letters into a paragraph does not render it: the block's element and the
 * text node the caret is in both survive, the characters reach the document, and
 * what is on screen is what the document says.
 *
 * The other half is the refusal: a character that could change how the text parses
 * — an asterisk, a space, a line ending — still goes through the ordinary path and
 * rebuilds the block, which is what keeps this an optimisation rather than a second
 * renderer.
 *
 * @covers src/ui/markdown/editing/typed_text.ts, src/ui/markdown/editing/context.ts
 */
(async () => {
  const t = window.__t;
  const out = t.report({});

  const document_ = 'A paragraph with fairly plain words in it.\n\nsecond\n';

  /** Reloads the document, puts the caret inside `needle`, then types `keys`. */
  const typeInto = async (needle, keys, inside = needle.length) => {
    await t.load(document_);
    const block = t.blocks().find((element) => element.textContent.includes(needle));
    const node = block ? t.textNodesIn(block).find((text) => text.data.includes(needle)) : null;
    if (!node) {
      return null;
    }
    const range = document.createRange();
    range.setStart(node, node.data.indexOf(needle) + inside);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: rect.left,
        clientY: rect.top + rect.height / 2
      })
    );
    await t.sleep(180);
    const before = {
      block,
      node,
      height: Math.round(t.scroller().scrollHeight),
      raw: await t.raw()
    };
    // The keystroke's own cost, and the geometry reads it makes: the fast path
    // should not read layout at all, which is the whole point of it.
    const reads = { rects: 0, heights: 0 };
    const rects = Element.prototype.getBoundingClientRect;
    const heights = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    let ms = 0;
    Element.prototype.getBoundingClientRect = function () {
      reads.rects += 1;
      return rects.call(this);
    };
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        reads.heights += 1;
        return this.getBoundingClientRect().height;
      }
    });
    const started = performance.now();
    for (const key of keys) {
      t.key(key);
    }
    ms = performance.now() - started;
    Element.prototype.getBoundingClientRect = rects;
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', heights);
    await t.sleep(250);
    const inserted = keys.join('');
    const at = before.raw.indexOf(needle) + inside;
    const after = t.blocks().find((element) => element.lineStart === before.block.lineStart);
    return {
      blockSurvived: after === before.block,
      textNodeSurvived: after ? t.textNodesIn(after).includes(before.node) : false,
      rendered: after ? after.textContent : '',
      heightGrowth: Math.round(t.scroller().scrollHeight) - before.height,
      ms: Math.round(ms * 10) / 10,
      reads,
      document:
        (await t.raw()) ===
        `${before.raw.slice(0, at)}${inserted}${before.raw.slice(at)}`
    };
  };

  out.plainLetter = await typeInto('fairly', ['y'], 3);
  out.plainLetterRun = await typeInto('plain', ['z', 'z'], 2);
  out.structuralAsterisk = await typeInto('plain', ['*'], 2);
  out.structuralSpace = await typeInto('plain', [' '], 2);
  return out;
})()
