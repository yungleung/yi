/**
 * Where a plain write leaves the offsets of the block it wrote into.
 *
 * The fast path writes a keystroke into a text node and renders nothing, so the
 * block's elements keep the offsets they were built with — and those offsets name
 * positions in the block's own text, which the write has moved. Typing into an
 * early word and then clicking into a later word of the same block is what reads
 * them: if the tags did not move, the click maps short by what was typed, and the
 * next letter lands with it.
 *
 * Both halves are checked, and both failed before `editing/typed_text.ts` moved the
 * tags with the write: the document (the letter has to land where the click was)
 * and the tags themselves (a tag that names the text it holds has to name the text
 * it holds).
 *
 * @covers src/ui/markdown/editing/typed_text.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  /** Puts the caret in a text node, the way a reader's click does. */
  const put = async (node, at) => {
    const caret = document.createRange();
    caret.setStart(node, at);
    caret.collapse(true);
    const box = caret.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left,
        clientY: box.top + box.height / 2
      })
    );
    await t.sleep(150);
  };
  /**
   * Every tag in the block that names the text it holds — the leaves and the shown
   * sources — with the document text it names now. Placeholders carry no text of
   * their own, and a formatting range covers markers its element does not show.
   */
  const tagsOf = (block, text) => {
    const charStart = Number(block.dataset.charStart);
    return [...block.querySelectorAll('[data-text-from], [data-source-from]')]
      .filter(
        (element) =>
          !element.classList.contains('markdown-list-placeholder') &&
          !element.classList.contains('markdown-empty-line-placeholder')
      )
      .map((element) => {
        const tag = Number(element.dataset.textFrom ?? element.dataset.sourceFrom);
        const holds = element.textContent.replace(/\u00a0/g, ' ');
        return {
          tag,
          holds,
          names: text.slice(charStart + tag, charStart + tag + holds.length)
        };
      });
  };

  await t.load('A paragraph with *emphasised* and fairly plain words in it.\n\nsecond\n');
  const block = t.blocks()[0];
  const early = t.textNodesIn(block).find((leaf) => leaf.data.includes('with'));
  await put(early, early.data.indexOf('with') + 2);
  for (const key of ['x', 'y', 'z']) {
    t.key(key);
  }
  await t.sleep(200);

  const typed = 'A paragraph wixyzth *emphasised* and fairly plain words in it.\n\nsecond\n';
  const tags = tagsOf(t.blocks()[0], typed);
  check(
    'every tag names the text it holds after a write',
    tags.every((tag) => tag.names === tag.holds),
    tags
  );

  const later = t.textNodesIn(t.blocks()[0]).find((leaf) => leaf.data.includes('words'));
  await put(later, later.data.indexOf('words') + 2);
  t.key('Q');
  await t.sleep(250);
  const document_ = await t.raw();
  check(
    'a caret later in the block lands where it was clicked',
    document_ === 'A paragraph wixyzth *emphasised* and fairly plain woQrds in it.\n\nsecond\n',
    document_
  );
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
