/**
 * Enter at the end of a fenced block's body puts the caret on the line it made — in all three
 * fenced blocks.
 *
 * A fenced code block's rendering is built from the parsed `code` node, and the line Enter makes
 * at the end of the body is not part of that node's value: the element has no line for it, so the
 * caret has nowhere to go and stays on the old one, a space-width further right (measured: `y`
 * unchanged, `x` +9px, while the document reads right). Frontmatter and display math are rendered
 * as the block's *own text*, which does have the line, and their caret moves down by one line.
 *
 * @covers src/ui/markdown/nodes/code/node.ts, src/ui/markdown/nodes/frontmatter.ts, src/ui/markdown/nodes/source_text.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });

  /** Puts the caret at the end of the body by clicking there, the way a reader does. */
  const clickEndOfBody = async (kind) => {
    const block = t.blocks()[0];
    if (kind === 'math') {
      // A click on the formula enters its source, at the end of the content.
      await t.click(block.querySelector('.markdown-display-math'), 0.5, 0.5);
      return;
    }
    // The body is one character, so a click at its end is unambiguous whatever the fences do.
    const node = t.textNodesIn(block).find((leaf) => leaf.data.includes('a'));
    await t.click(node.parentElement, 0.99);
  };

  const cases = [
    {
      name: 'fenced code',
      doc: '```js\na\n```\n',
      kind: 'code',
      made: '```js\na\n\n```\n',
      after: '```js\na\n\nx\n```\n'
    },
    {
      name: 'frontmatter',
      doc: '---\na\n---\n',
      kind: 'frontmatter',
      made: '---\na\n\n---\n',
      after: '---\na\n\nx\n---\n'
    },
    {
      name: 'display math',
      doc: '$$\na\n$$\n',
      kind: 'math',
      made: '$$\na\n\n$$\n',
      after: '$$\na\n\nx\n$$\n'
    }
  ];

  for (const entry of cases) {
    await t.load(entry.doc);
    await t.sleep(200);
    await clickEndOfBody(entry.kind);
    await t.sleep(200);
    const before = t.caretRect();
    t.key('Enter');
    await t.sleep(300);
    const after = t.caretRect();
    const made = await t.raw();
    check(`${entry.name}: Enter makes a line`, made, entry.made);
    // Drawn where the line is: a line down, at the body's own left edge.
    check(
      `${entry.name}: and the caret is on that line`,
      before !== null && after !== null && after.y - before.y >= 20,
      true
    );
  }

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
