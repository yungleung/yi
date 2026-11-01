/**
 * What writing into a highlighted code block *locally* would show when the write is a
 * delimiter: the rest of the line keeps the colours of the text that was there.
 *
 * A typed `"` inside an identifier opens a string, and a `"` at the end of one closes it —
 * both change how the rest of the line is read, so a write that only patches the text node
 * leaves the *previous* reading's colours on screen until the burst stops and the highlight
 * is refreshed (the deferred check's timer, ~200 ms of idle). This probe measures exactly
 * that: it patches the text node by hand, times it, and compares the element it left with a
 * fresh render of the same document by the app's own block factory.
 *
 * The writes that leave the markup *identical* — a letter, a digit, a backtick in a string,
 * a slash in a comment — are `code-local-write.js`: the nine cases were one probe until the
 * pair outlived the bridge's five seconds (measured: 3 121 ms on a fresh page, and cut off on
 * an app that had been driven for a while), and this half is the one the decision turns on —
 * what the trade-off would show.
 *
 * Reported per case: the write's cost (with the one height read a fast path makes), whether
 * the markup is identical to a fresh render, how many characters of the visible text carry
 * the wrong styling when it is not, and what the repair costs when the burst ends.
 *
 * @covers src/ui/markdown/nodes/code/node.ts, src/ui/markdown/editing/typed_text.ts
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
    { label: 'a quote in an identifier', needle: 'answer', insert: '"' },
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
