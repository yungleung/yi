/**
 * Does a code block's layout cost come from the highlight markup?
 *
 * P28 timed a code keystroke from inside the app: 31 ms, of which the block's own rebuild and
 * layout is everything (the parse is 4 ms of cached lookups) — and both write designs that
 * avoided the rebuild still cost ~28 ms, which leaves the layout that any change to that block
 * triggers. An 80-line block carries a few hundred highlight spans; a paragraph carries one
 * line. So this probe does the same tiny edit to the element three ways — as hljs leaves it,
 * with each line cut into a block box of its own, and as one plain text node — and times the
 * layout each edit forces.
 *
 * It patches and reads five times and reports every round, because a forced layout can be
 * answered from a layout the browser has not re-run (P26's write figure of 2–4 ms was exactly
 * that). The comparison between the ways is what survives that: they share whatever the
 * artefact is. Nothing touches the document — the app keeps the text it had — so this is the
 * layout and nothing else. A paragraph is the control.
 *
 * @covers src/ui/markdown/nodes/code/node.ts, src/ui/markdown/virtual_block_renderer.ts
 * @needs-large-document — a code block of the fixture note's size.
 */
(async () => {
  const t = window.__t;
  const codeLines = Array.from(
    { length: 80 },
    (_, index) => `const fairlyPlain${index} = someFairlyLongFunction(argument${index});`
  );
  const document_ = `\`\`\`js\n${codeLines.join('\n')}\n\`\`\`\n`;
  /** A fenced block's content, as its element should hold it. */
  const contentOf = (markdown) => markdown.split('\n').slice(1, -2).join('\n');

  /**
   * The cut a per-line rendering would make: every line in a block box of its own, every span
   * kept, and a span that crosses a line reopened on the next one. Done by hand here, so the
   * probe measures the layout rather than a change to the app.
   */
  const cutIntoLines = (code) => {
    const rows = [];
    const open = [];
    const target = () => open[open.length - 1]?.clone ?? rows[rows.length - 1];
    const copyOf = (source) => {
      const clone = document.createElement(source.tagName);
      clone.className = source.className;
      return clone;
    };
    const newRow = () => {
      const row = document.createElement('span');
      row.style.display = 'block';
      rows.push(row);
      const reopen = [...open];
      open.length = 0;
      for (const entry of reopen) {
        const clone = copyOf(entry.source);
        target().append(clone);
        open.push({ source: entry.source, clone });
      }
    };
    const visit = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const parts = node.data.split('\n');
        parts.forEach((part, index) => {
          if (index > 0) {
            target().append(document.createTextNode('\n'));
            newRow();
          }
          if (part !== '') {
            target().append(document.createTextNode(part));
          }
        });
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }
      const clone = copyOf(node);
      target().append(clone);
      open.push({ source: node, clone });
      for (const child of [...node.childNodes]) {
        visit(child);
      }
      open.pop();
    };
    const children = [...code.childNodes];
    code.textContent = '';
    newRow();
    for (const child of children) {
      visit(child);
    }
    code.append(...rows);
  };

  /** One edit and one forced layout, five times: what a round is for. */
  const timeRounds = (block, node, pick) => {
    const times = [];
    for (let round = 0; round < 5; round += 1) {
      const at = pick(node);
      const started = performance.now();
      node.data = `${node.data.slice(0, at)}x${node.data.slice(at)}`;
      // What `measureEditedBlock` does first, and what forces the layout the edit invalidated.
      block.getBoundingClientRect().height;
      times.push(Math.round((performance.now() - started) * 10) / 10);
    }
    return times;
  };
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const counts = (element) => ({
    elements: element.querySelectorAll('*').length,
    textNodes: t.textNodesIn(element).length
  });
  const inCode = (needle) => (node) => node.data.indexOf(needle) + 2;

  const results = [];
  for (const [label, prepare] of [
    ['as rendered (one inline flow)', () => {}],
    ['each line its own block box', cutIntoLines],
    ['as one plain text node', (code) => (code.textContent = contentOf(document_))]
  ]) {
    await t.load(document_);
    const block = t.blocks()[0];
    const code = block.querySelector('code');
    prepare(code);
    const node = t.textNodesIn(code).find((leaf) => leaf.data.includes('fairlyPlain0'));
    const times = timeRounds(block, node, inCode('fairlyPlain0'));
    results.push({ label, times, median: median(times), markup: counts(code) });
  }

  // The control: the same treatment on a paragraph of the same length, which has one text node
  // and one element to lay out.
  const paragraph = Array.from(
    { length: 40 },
    (_, index) =>
      `A fairly plain paragraph number ${index} with enough words to wrap over a line.`
  ).join('\n\n');
  await t.load(`${paragraph}\n`);
  const block = t.blocks()[0];
  const node = t.textNodesIn(block).find((leaf) => leaf.data.includes('paragraph'));
  const times = timeRounds(block, node, inCode('paragraph'));
  results.push({
    label: 'a paragraph of the same length',
    times,
    median: median(times),
    markup: counts(block)
  });

  return { results };
})()
