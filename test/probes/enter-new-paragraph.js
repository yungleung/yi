/**
 * `Enter` at the end of a block leaves the caret on the line it made, so the next
 * thing typed is a paragraph of its own.
 *
 * The rule is easy to get wrong by asking where the new line is *before* the line
 * exists: the caret then stays at the end of the block the key was pressed in, and
 * the next keystroke joins that block's text. Measured three ways — a paragraph in
 * the middle of a document (the next block must stay apart), the last paragraph of a
 * file (there the text needs its own blank line *above* it), and a new note's blank
 * body line, which is the same last-line case under a frontmatter.
 *
 * @covers src/ui/markdown/editing/context.ts, src/ui/markdown/editing/blank_lines/,
 *   src/ui/markdown/document/state.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const failed = () => checks.filter((entry) => !entry.pass).map((entry) => entry.name);

  /** Puts the caret at the end of the text node holding `needle`. */
  const caretAtEndOf = async (needle) => {
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
    await t.sleep(120);
  };

  /** Enter, then a letter: the letter is a paragraph of its own when the rule holds. */
  const typeAfterEnter = async (letter) => {
    t.key('Enter');
    await t.sleep(200);
    t.key(letter);
    await t.sleep(200);
    return await t.raw();
  };

  await t.load('first line\n\nsecond line\n');
  await caretAtEndOf('first line');
  check(
    'a letter typed after Enter at a middle paragraph ends is its own paragraph',
    await typeAfterEnter('x'),
    'first line\n\nx\n\nsecond line\n'
  );

  await t.load('only line\n');
  await caretAtEndOf('only line');
  check(
    'a letter typed after Enter at the last paragraph of a file is its own paragraph',
    await typeAfterEnter('x'),
    'only line\n\nx\n'
  );

  // A new note: a frontmatter, then the blank body line the reader types the first
  // paragraph into. The body line is the last line of the file.
  await t.load('---\ntitle: Untitle\ndate: 2026-10-03\nid: 20261003121500\nkeywords:\n  - untagged\n---\n\n');
  const placeholder = t
    .blocks()
    .find((element) => element.querySelector('.markdown-empty-line-placeholder'))
    ?.querySelector('.markdown-empty-line-placeholder');
  await t.click(placeholder);
  t.key('H');
  t.key('i');
  await t.sleep(200);
  const afterTyping = await typeAfterEnter('Y');
  check(
    'a letter typed after Enter on a new note body line is its own paragraph',
    afterTyping.endsWith('---\n\nHi\n\nY\n'),
    true
  );
  check(
    'and the two paragraphs are separate blocks',
    t.blocks().map((element) => element.textContent.trim()).filter(Boolean).slice(-2),
    ['Hi', 'Y']
  );

  return { checks, failed: failed() };
})()
