/**
 * The frontmatter id is the note's name, and the editor will not let it be typed over.
 *
 * The carets are placed in the rendered frontmatter itself: one inside the id's own number, one
 * inside the title's words. The first keystroke is refused and says why; the second is the
 * ordinary write, so the pin is narrow enough to leave the rest of the frontmatter to its author.
 *
 * @covers src/ui/markdown/editing/id_lock.ts, src/ui/markdown/editing/context.ts (applyEdit),
 *   src/services/document_identity.ts (idLineRange)
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const doc = '---\nid: 20240707122715\ntitle: A note\n---\n\nBody\n';
  await t.load(doc);
  await t.sleep(350);

  const frontmatter = () => document.querySelector('.markdown-frontmatter');
  const idValue = frontmatter()?.querySelector('.hljs-number');
  if (idValue) {
    await t.click(idValue, 0.5);
    await t.sleep(200);
    t.key('9');
    await t.sleep(250);
  }
  check('a character typed into the id leaves the text alone', await t.raw(), doc);
  check(
    'and the app says why',
    (document.querySelector('[data-hint-text]')?.textContent ?? '').length > 0,
    document.querySelector('[data-hint-text]')?.textContent ?? null
  );

  const titleWord = frontmatter()?.querySelector('.hljs-string');
  if (titleWord) {
    await t.click(titleWord, 0.99);
    await t.sleep(200);
    t.key('X');
    await t.sleep(250);
  }
  const written = await t.raw();
  check('typing in the title still writes', written.includes('title: A'), written);
  check('and the id is still the one it was', written.includes('id: 20240707122715'), written);

  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
