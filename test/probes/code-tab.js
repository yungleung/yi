/**
 * Tab inside a fenced block types two spaces — in all three kinds, because they are one class: a
 * code block, the frontmatter and a display formula all keep their lines
 * (`editing/code.ts: applyCodeIndent`).
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const tab = async () => {
    t.scroller().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    );
    await t.sleep(300);
  };
  const cases = [
    {
      name: 'a fenced code block',
      doc: 'intro\n\n```ts\nlet a = 1;\n```\n\noutro\n',
      enter: () => t.prose().querySelector('pre'),
      out: 'intro\n\n```ts\n  let a = 1;\n```\n\noutro\n'
    },
    {
      name: 'the frontmatter',
      doc: '---\nid: 1\n---\n\noutro\n',
      enter: () => t.prose().querySelector('.markdown-frontmatter'),
      out: '---\n  id: 1\n---\n\noutro\n'
    },
    {
      name: 'a display formula',
      doc: 'intro\n\n$$\n\\frac{a}{b}\n$$\n',
      enter: () => t.prose().querySelector('[data-display="true"]'),
      // A click on KaTeX cannot name a character: it enters at the end of the formula's content
      // (`source_mode.ts: sourceEntryOffset`), so the two spaces go there.
      out: 'intro\n\n$$\n\\frac{a}{b}  \n$$\n'
    }
  ];
  for (const entry of cases) {
    await t.load(entry.doc);
    await t.sleep(200);
    // The caret goes to the start of the block's first line, so the step lands in front of it.
    await t.click(entry.enter(), 0.02, 0.5);
    await t.sleep(250);
    await tab();
    check(`${entry.name}: Tab types two spaces at the caret`, await t.raw(), entry.out);
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
