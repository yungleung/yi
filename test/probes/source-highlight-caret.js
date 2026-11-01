/**
 * Highlighted source hands the caret the character it means.
 *
 * Highlighting splits a block's text into as many spans as the grammar finds, and the app
 * places the caret by character offset over that markup (`caret/offsets.ts`). So the markup may
 * not add, drop or reorder a character — and a click into a fenced block has to take the caret to
 * the character it landed on, both through the body such a block renders and through the source
 * view it becomes the moment the caret is inside it (`nodes/fence/text.ts`): the click maps
 * through the body's own characters, and the block is rebuilt around the caret at that offset.
 *
 * `source-theme.js` holds the colours; this holds the characters.
 *
 * @covers src/ui/markdown/nodes/fence/text.ts, src/ui/markdown/nodes/frontmatter_highlight.ts,
 *   src/ui/markdown/nodes/code/highlight.ts, src/ui/markdown/nodes/editable_node.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');

  const FRONTMATTER = '---\nid: 20240707122715\ntitle: "A note"\nauthor: me\n---';
  const FENCE = '```ts\nconst a = 1;\n```';
  const document_ = [FRONTMATTER, '', FENCE, '', 'tail', ''].join('\n');
  const frontmatter = () => t.prose().querySelector('.markdown-frontmatter');
  /** The fenced block: the frontmatter is a `pre.markdown-node` too, so it is named. */
  const fence = () =>
    [...t.prose().querySelectorAll('pre.markdown-node')].find((pre) =>
      pre.querySelector('code.language-ts')
    );

  /**
   * Clicks the character at `offset` in the first text node of `root` that starts with
   * `prefix`, the way a click on that character does, and reports where the caret went.
   */
  const clickCharacter = async (root, prefix, offset) => {
    const node = t.textNodesIn(root).find((candidate) => candidate.data.startsWith(prefix));
    if (!node) return null;
    const line = root.closest('.markdown-block')?.dataset.lineStart ?? '';
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: rect.left + 1, clientY: rect.top + 2 })
    );
    await t.sleep(200);
    const caret = caretModule.getCaretRange();
    // The block is built again as its own source once the caret is inside it, so "inside" is asked
    // of the block as it is now: the element that was clicked is gone by this point.
    const current = t.prose().querySelector(
      `.markdown-block[data-line-start="${line}"]`
    );
    return caret === null
      ? null
      : {
          offset: caret.startOffset,
          text: caret.startContainer.textContent,
          inside: current !== null && current.contains(caret.startContainer)
        };
  };

  // 1. A character in the middle of a key. The id line is pinned (`editing/id_lock.ts`), so this
  //    walks the keys beside it.
  await t.load(document_);
  const inKey = await clickCharacter(frontmatter(), 'title', 2);
  check(
    'a click in the frontmatter puts the caret at the character clicked',
    inKey !== null && inKey.inside === true && inKey.offset === 2 && inKey.text === 'title:',
    inKey
  );
  t.key('I');
  await t.sleep(300);
  check(
    'and typing writes the document at that character',
    (await t.raw()) === document_.replace('title:', 'tiItle:'),
    await t.raw()
  );

  // 2. A character on a later line of it: the click maps through the highlighted markup
  // line by line, not just at the block's edges.
  await t.load(document_);
  const inTitle = await clickCharacter(frontmatter(), 'author', 2);
  check(
    'a click on a later line of the frontmatter lands on that line',
    inTitle !== null && inTitle.inside === true && inTitle.offset === 2 && inTitle.text === 'author:',
    inTitle
  );
  t.key('T');
  await t.sleep(300);
  check(
    'and the character typed is written on that line',
    (await t.raw()) === document_.replace('author:', 'auTthor:'),
    await t.raw()
  );

  // 3. The same shape in a fenced code block, which has always worked.
  await t.load(document_);
  const inConst = await clickCharacter(fence(), 'const', 5);
  t.key('Z');
  await t.sleep(300);
  check(
    'and a click inside a highlighted code block writes the character it was aimed at',
    inConst !== null &&
      inConst.inside === true &&
      (await t.raw()) === document_.replace('const a = 1;', 'constZ a = 1;'),
    { caret: inConst, raw: await t.raw() }
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
