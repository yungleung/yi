/**
 * A fenced block has two shapes, decided by the caret: the body it renders while the caret is
 * elsewhere — KaTeX, for a display formula — and its own text, delimiters and all, while the caret
 * is inside it. One component draws both (`nodes/fence/text.ts`), and the corner label is there in
 * either shape.
 *
 * @covers src/ui/markdown/create_block.ts, src/ui/markdown/nodes/fence/text.ts,
 *   src/ui/markdown/document/block/model.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });

  /** What the block starting at `line` shows right now, and what its corner says. */
  const shape = (line) => {
    const element = t.prose().querySelector(`.markdown-block[data-line-start="${line}"]`);
    const box = element?.firstElementChild ?? null;
    return {
      text: box?.textContent ?? null,
      source: String(box?.className ?? '').includes('markdown-source-text'),
      label: element?.querySelector('.markdown-fence-label')?.textContent ?? null
    };
  };

  const doc = ['---', 'id: 1', '---', '', '```ts', 'let a = 1;', '```', '', '$$', '\\frac{a}{b}', '$$', '', 'tail', ''].join('\n');
  await t.load(doc);
  await t.sleep(250);

  // The rendered shape: the body, with the delimiters hidden.
  check('the frontmatter renders its body while the caret is elsewhere', shape(1), {
    text: 'id: 1\n',
    source: false,
    label: 'YAML Frontmatter'
  });
  check('and so does a fenced code block', shape(5), { text: 'let a = 1;\n', source: false, label: 'ts' });
  check('while a display formula renders KaTeX, with no label', [shape(9).source, shape(9).label], [false, null]);

  // The source shape, entered by clicking the rendering: the block's own characters, in order.
  await t.click(t.prose().querySelector('.markdown-fenced-code'), 0.5, 0.5);
  await t.sleep(300);
  check('clicking a code block shows its own text, delimiters and all', shape(5), {
    text: '```ts\nlet a = 1;\n```',
    source: true,
    label: 'ts'
  });

  await t.click(t.prose().querySelector('.markdown-frontmatter'), 0.5, 0.5);
  await t.sleep(300);
  check('the frontmatter shows its delimiters the same way', shape(1), {
    text: '---\nid: 1\n---',
    source: true,
    label: 'YAML Frontmatter'
  });
  check('and the code block behind it is rendered again', shape(5).source, false);

  await t.click(t.prose().querySelector('[data-display="true"]'), 0.5, 0.5);
  await t.sleep(300);
  check('a display formula shows its own text too', shape(9), {
    text: '$$\n\\frac{a}{b}\n$$',
    source: true,
    label: 'latex'
  });
  check('and the frontmatter behind it is rendered again', shape(1).source, false);

  // Leaving the block renders it again.
  const tail = [...t.prose().querySelectorAll('.markdown-block')].pop();
  await t.click(tail, 0.5);
  await t.sleep(300);
  check('leaving a block renders it again', [shape(9).source, shape(9).label], [false, null]);

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
