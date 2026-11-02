/**
 * The frontmatter id is the note's name, and the editor will not let it be typed over.
 *
 * The carets are placed in the rendered frontmatter itself: one inside the id's own number, one
 * inside the title's words. The first keystroke is refused and says why; the second is the
 * ordinary write, so the pin is narrow enough to leave the rest of the frontmatter to its author.
 *
 * @covers src/ui/markdown/editing/id_lock.ts, src/ui/markdown/editing/context.ts (applyEdit),
 *   src/ui/markdown/document/identity.ts (idLineRange)
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const doc = '---\nid: 20240707122715\ntitle: A note\n---\n\nBody\n';
  await t.load(doc);
  await t.sleep(350);

  const frontmatter = () => document.querySelector('.markdown-frontmatter');
  /** Places the caret by character, through the markup the highlighter drew. */
  const clickCharacter = async (prefix, offset) => {
    const node = t.textNodesIn(frontmatter()).find((candidate) =>
      candidate.data.startsWith(prefix)
    );
    if (!node) return false;
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: rect.left + 1, clientY: rect.top + 2 })
    );
    await t.sleep(250);
    return true;
  };

  const inId = await clickCharacter('20240707122715', 2);
  if (inId) {
    t.key('9');
    await t.sleep(250);
  }
  const afterId = await t.raw();
  check('a character typed into the id leaves the text alone', afterId === doc, afterId);
  check(
    'and the app says why',
    (document.querySelector('[data-hint-text]')?.textContent ?? '').length > 0,
    document.querySelector('[data-hint-text]')?.textContent ?? null
  );

  const inTitle = await clickCharacter('note', 4);
  if (inTitle) {
    t.key('X');
    await t.sleep(250);
  }
  const written = await t.raw();
  check('typing in the title still writes', written.includes('title: A noteX'), written);
  check('and the id is still the one it was', written.includes('id: 20240707122715'), written);

  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
