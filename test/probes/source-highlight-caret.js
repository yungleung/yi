/**
 * The show goes on: a highlighted block still hands the caret the character it means.
 *
 * Highlighting splits a block's text into as many spans as the grammar finds, and the
 * app places the caret by character offset over that markup (`caret/offsets.ts`). So the
 * markup may not add, drop or reorder a single character, or typing lands beside the one
 * the author aimed at. This is that, measured: the frontmatter (a block that is its own
 * text), a line inside it, and a character in the middle of a highlighted code block —
 * each one typed into and checked against the document.
 *
 * `source-theme.js` holds the colours; this holds the characters.
 *
 * @covers src/ui/markdown/nodes/frontmatter_highlight.ts, src/ui/markdown/create_block.ts,
 *   src/ui/markdown/nodes/code_block.ts, src/ui/markdown/nodes/editable_node.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');

  const FRONTMATTER = '---\nid: 20240707122715\ntitle: "A note"\n---';
  const FENCE = '```ts\nconst a = 1;\n```';
  const document_ = [FRONTMATTER, '', FENCE, '', 'tail', ''].join('\n');
  const frontmatter = () => t.prose().querySelector('.markdown-frontmatter');
  const fence = () => t.prose().querySelector('pre.markdown-node');

  // 1. The frontmatter's first character. A click resolves to the nearest block edge for a
  // block that is not a node component (`editing/pointer.ts`), which for a click near the
  // top is the block's start — the document's own offset zero.
  await t.load(document_);
  await t.click(frontmatter(), 0.05, 0.15);
  await t.sleep(200);
  t.key('X');
  await t.sleep(300);
  check(
    'typing after a click in the frontmatter writes the document`s first character',
    (await t.raw()) === `X${document_}`,
    await t.raw()
  );

  // 2. A line inside it: down one line, two characters right, which is between the `id`
  // and its `:` — three spans into the highlighted block.
  await t.load(document_);
  await t.click(frontmatter(), 0.05, 0.15);
  await t.sleep(200);
  t.key('ArrowDown');
  await t.sleep(150);
  t.key('ArrowRight');
  t.key('ArrowRight');
  await t.sleep(200);
  const placed = caretModule.getCaretRange();
  t.key('I');
  await t.sleep(300);
  check(
    'stepping into the `id:` line writes between the key and its colon',
    (await t.raw()) === document_.replace('id:', 'idI:'),
    {
      raw: await t.raw(),
      caret: placed === null ? null : { offset: placed.startOffset, text: placed.startContainer.textContent }
    }
  );

  // 3. A character in the middle of a code block's own highlighted markup: `const` is one
  // span, and the caret goes to its last character.
  await t.load(document_);
  const keyword = [...t.textNodesIn(fence())].find((node) => node.data.includes('const'));
  let onConst = null;
  if (keyword) {
    const range = document.createRange();
    range.setStart(keyword, 5);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    keyword.parentElement.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: rect.left + 1, clientY: rect.top + 2 })
    );
    await t.sleep(200);
    const caret = caretModule.getCaretRange();
    onConst = caret === null ? null : { offset: caret.startOffset, text: caret.startContainer.textContent };
  }
  t.key('Z');
  await t.sleep(300);
  check(
    'and a click inside a highlighted code block writes the character it was aimed at',
    (await t.raw()) === document_.replace('const a = 1;', 'constZ a = 1;'),
    { raw: await t.raw(), caret: onConst }
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
