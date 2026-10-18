/**
 * The frontmatter is YAML, and YAML may end it with `...` as well as `---`.
 *
 * A note written by another editor may close its frontmatter with YAML's own document-end
 * marker; the app has to read that as the same block, hide both delimiters while the caret is
 * elsewhere, and keep a character typed at the end of the YAML body off the closing line. A
 * `+++` block is not frontmatter at all: it is ordinary text.
 *
 * @covers src/ui/markdown/syntax/markers.ts (frontmatterDelimiter, closesFrontmatter, fenceBody),
 *   src/ui/markdown/document/blocks.ts, src/ui/markdown/syntax/parser.ts
 * @covers src/services/document_identity.ts (readFrontmatterTitle, firstHeading)
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const label = (block) => block?.querySelector('.markdown-fence-label')?.textContent ?? null;
  const shown = () => document.querySelector('.prose')?.textContent ?? '';

  const dotted = '---\ntitle: A note\n...\n\n# Body\n';
  await t.load(dotted);
  await t.sleep(350);
  const blocks = t.blocks();
  check(
    'a frontmatter closed by ... is frontmatter',
    blocks[0]?.querySelector('.markdown-frontmatter') !== null,
    blocks[0]?.querySelector('.markdown-frontmatter')?.className ?? null
  );
  check('and says what it is', label(blocks[0]), 'YAML Frontmatter');
  // The caret starts at the top of the note, inside the block; the body view is what a reader
  // sees once the caret is elsewhere.
  const heading = t.prose().querySelector('h1');
  if (heading) {
    await t.click(heading, 0.5);
    await t.sleep(250);
  }
  check('the end marker is not text the reader sees', !shown().includes('...'), shown());
  check('and the note’s own body follows it', shown().includes('Body'), true);

  // A character typed at the end of the YAML body joins its last line, not the `...` line.
  const pre = document.querySelector('.markdown-frontmatter');
  const text = pre ? t.textNodesIn(pre).pop() : null;
  if (text) {
    await t.click(text.parentElement, 0.99);
    await t.sleep(200);
    t.key('X');
    await t.sleep(300);
  }
  check(
    'typing at the body’s end stays off the closing line',
    await t.raw(),
    '---\ntitle: A noteX\n...\n\n# Body\n'
  );

  // `+++` is no longer a fence: the block is text, and so are its markers.
  await t.load('+++\ntitle = "X"\n+++\n\nBody\n');
  await t.sleep(350);
  check('a +++ block is not frontmatter', document.querySelector('.markdown-frontmatter') === null, true);
  check('and its fences are text', shown().includes('+++'), true);

  // The app's own readers get their values from YAML: a comment is not part of the title, a colon
  // inside a quoted title survives, and an id keeps its leading zeros.
  const session = await t.app('/src/services/session.ts');
  await session.documentSession.openFile({
    path: null,
    content:
      '---\ntitle: "A title: with a colon" # the reader’s\nid: 00123456789012\n...\n\n# Body\n'
  });
  await t.sleep(350);
  const current = session.documentSession.current();
  check(
    'the session reads the quoted title whole',
    current?.title === 'A title: with a colon',
    current?.title ?? null
  );
  check(
    'and keeps the id as the text it was written as',
    current?.id === '00123456789012',
    current?.id ?? null
  );

  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
