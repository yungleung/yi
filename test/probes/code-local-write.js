/**
 * What writing into a highlighted code block *locally* would cost, and what it would show.
 *
 * A keystroke inside a fenced code block costs 25–34 ms on a 4.7 KB block because the block
 * is rebuilt: the write half of the fast path needs one tagged text node and highlight.js
 * leaves none (`typing-cost-by-kind.js`). The other shape is to write the character into the
 * text node the caret is in anyway — the plain write's own 0–1 ms patch — and let the
 * highlight be refreshed when the burst stops, the way the deferred check already parses once
 * a burst. That trade would put the *previous* text's colours on screen for the length of a
 * burst, and this probe measures exactly that: it patches a text node by hand, times it, and
 * compares the element it left with a fresh render of the same document by the app's own
 * block factory — the app's own answer to "what should this look like".
 *
 * Reported per case: the write's cost (with the one height read a fast path makes), whether
 * the markup is identical to a fresh render, how many characters of the visible text carry
 * the wrong styling when it is not, and what the repair costs when the burst ends.
 *
 * @covers src/ui/markdown/nodes/code_block.ts, src/ui/markdown/editing/typed_text.ts
 *
 * **Read `writeMs` with care.** It is the patch alone — a text node and one height read — and
 * the browser can answer that read from a layout it has not re-run. The app's own path (P27
 * built it and reverted it) measured 28 ms against the rebuild's 30: it also measures the
 * block, restores the caret and lets the page lay out again. The staleness numbers here are
 * what this probe is for; its write figure is a floor, not a forecast.
 */
(async () => {
  const t = window.__t;
  const { MarkdownEditorState } = await t.app('/src/ui/markdown/document/state.ts');
  const { createBlockComponent } = await t.app('/src/ui/markdown/create_block.ts');
  const markup =
    '```js\n' +
    '// a comment about words\n' +
    'const answer = 42;\n' +
    'const name = "some string here";\n' +
    'const ratio = 8 / 2;\n' +
    '```\n';
  const cases = [
    { label: 'a letter in an identifier', needle: 'answer', insert: 'x' },
    { label: 'a letter in a string', needle: 'some', insert: 'x' },
    { label: 'a letter in a comment', needle: 'comment', insert: 'x' },
    { label: 'a digit in an identifier', needle: 'answer', insert: '7' },
    { label: 'a quote in an identifier', needle: 'answer', insert: '"' },
    { label: 'a backtick in a string', needle: 'some', insert: '`' },
    { label: 'a slash in a comment', needle: 'a comment', insert: '/' },
    { label: 'a slash after a slash (a comment starts)', needle: '/', insert: '/' },
    { label: 'a quote closing a string', needle: 'string here', insert: '"' }
  ];

  /** Every character of an element's text with the classes its own span carries. */
  const styled = (element) => {
    const out = [];
    for (const node of t.textNodesIn(element)) {
      const owner = node.parentElement?.closest('code > *, code') ?? node.parentElement;
      const style = owner ? owner.className : '';
      for (const character of node.data) {
        out.push(`${character}\u0000${style}`);
      }
    }
    return out;
  };
  /** The index and character offset of a text node inside its element's own text. */
  const offsetOf = (element, node, inside) => {
    let seen = 0;
    for (const leaf of t.textNodesIn(element)) {
      if (leaf === node) {
        return seen + inside;
      }
      seen += leaf.data.length;
    }
    return null;
  };

  const results = [];
  for (const entry of cases) {
    await t.load(markup);
    const block = t.blocks()[0];
    const code = block.querySelector('code');
    const node = t.textNodesIn(code).find((leaf) => leaf.data.includes(entry.needle));
    if (!node) {
      results.push({ label: entry.label, error: 'the word is not in one text node' });
      continue;
    }
    const inside = node.data.indexOf(entry.needle) + Math.ceil(entry.needle.length / 2);
    const renderedOffset = offsetOf(code, node, inside);
    // Where that character is in the document: a fenced block's content starts after its
    // opening line, and its characters are the document's one for one.
    const documentOffset = markup.indexOf('\n') + 1 + renderedOffset;
    const edited = markup.slice(0, documentOffset) + entry.insert + markup.slice(documentOffset);

    // The simulated fast write: the text node, and the height read the write is followed by.
    const started = performance.now();
    node.data = `${node.data.slice(0, inside)}${entry.insert}${node.data.slice(inside)}`;
    if (block) {
      block.getBoundingClientRect().height;
    }
    const writeMs = performance.now() - started;

    // What the app says the block should look like now, from the edited document.
    const freshState = new MarkdownEditorState(edited);
    const freshBlock = freshState.getBlocks()[0];
    const built = performance.now();
    const fresh = freshBlock
      ? createBlockComponent(freshBlock, freshState.getBlockContent(freshBlock)).element
      : null;
    const repairMs = performance.now() - built;
    const freshCode = fresh?.querySelector('code') ?? null;

    const live = styled(code);
    const wanted = freshCode ? styled(freshCode) : [];
    const differing = live.filter((pair, index) => pair !== wanted[index]);
    const firstDiffers = live.findIndex((pair, index) => pair !== wanted[index]);
    results.push({
      label: entry.label,
      writeMs: Math.round(writeMs * 10) / 10,
      identical: code.innerHTML === (freshCode?.innerHTML ?? ''),
      staleCharacters: differing.length,
      where:
        firstDiffers < 0
          ? null
          : {
              character: live[firstDiffers]?.split('\u0000')[0] ?? null,
              stale: live[firstDiffers]?.split('\u0000')[1] ?? null,
              wanted: wanted[firstDiffers]?.split('\u0000')[1] ?? null
            },
      repairMs: Math.round(repairMs * 10) / 10
    });
  }

  return { results };
})()
