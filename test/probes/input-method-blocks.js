/**
 * A committed word in each prose block: the paragraph, the heading and the list item.
 *
 * The seam does not know what a block is — it hands the word to `insertCommitted`, which
 * follows the same rules typing does. This probe holds that promise at the three places
 * where a paragraph is not a plain paragraph.
 *
 * @covers src/ui/markdown/editing/text_commands.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const seam = () => document.querySelector('.markdown-composition-input');
  /** Composes `word` into the seam, the way the system commits one. */
  const compose = async (word) => {
    const area = seam();
    area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    area.value = word;
    area.dispatchEvent(new CompositionEvent('compositionend', { data: word, bubbles: true }));
    await t.sleep(250);
  };
  /** Puts the caret at the end of the text holding `needle`, wherever it sits in a block. */
  const atEndOfText = async (needle) => {
    const block = t.blocks().find((element) => element.textContent.includes(needle));
    const node = t.textNodesIn(block).find((leaf) => leaf.data.includes(needle));
    const range = document.createRange();
    range.setStart(node, node.data.indexOf(needle) + needle.length);
    range.collapse(true);
    const box = range.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left,
        clientY: box.top + box.height / 2
      })
    );
    await t.sleep(150);
  };

  await t.load('# 見出し\n\ntext\n\n- item\n');
  await atEndOfText('text');
  await compose('文');
  check('a word commits into a paragraph', await t.raw(), '# 見出し\n\ntext文\n\n- item\n');

  await atEndOfText('見出し');
  await compose('字');
  check('and into a heading', await t.raw(), '# 見出し字\n\ntext文\n\n- item\n');

  await atEndOfText('item');
  await compose('語');
  check('and into a list item', await t.raw(), '# 見出し字\n\ntext文\n\n- item語\n');

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
