/**
 * The fixture workspace is wired to the app: the app's config names it, and the
 * demo document's wikilinks resolve against the committed notes.
 *
 * The resolution is observable because `[[虚无与生发]]` renders the *target
 * note's heading 1* (`20211221171028 虚无与生发`), which differs from the
 * target the document typed. It is also lazy — a wikilink resolves when it
 * comes near the viewport — so the probe scrolls the document and collects what
 * the links render as it goes.
 *
 * @covers src/ui/markdown/nodes/wikilink.ts (title resolution)
 * @fixture test/fixtures/workspace/ (the whole notes folder)
 * @needs-workspace
 *
 * Run with:
 *   npm run probe -- --with-workspace --with-doc \
 *     test/fixtures/workspace/default-document.md test/probes/fixture-workspace.js
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const config = await window.__TAURI_INTERNALS__.invoke('get_config');
  checks.push({
    name: 'the app is pointed at the fixture workspace',
    actual: config.workspace,
    expected: 'a path ending in test/fixtures/workspace',
    pass: String(config.workspace).endsWith('test/fixtures/workspace')
  });
  checks.push({
    name: 'and at the fixture bibliography',
    actual: config.bibliography_file,
    expected: 'a path ending in test/fixtures/workspace/zotero.bib',
    pass: String(config.bibliography_file).endsWith('zotero.bib')
  });

  const scroller = t.scroller();
  const rendered = new Set();
  t.report({ step: 'scrolling for wikilinks' });
  for (let step = 0; step < 10; step += 1) {
    for (const element of t.prose().querySelectorAll('.markdown-wikilink')) {
      rendered.add(element.textContent ?? '');
    }
    if ([...rendered].some((text) => text === '20211221171028 虚无与生发')) {
      break;
    }
    scroller.scrollTop += scroller.clientHeight;
    await t.sleep(150);
  }
  const texts = [...rendered];
  t.report({ config: config.workspace, texts });
  check(
    'a wikilink resolved to the target note\'s heading',
    texts.includes('20211221171028 虚无与生发'),
    true
  );
  check('no rendered wikilink shows its brackets', texts.filter((text) => text.includes('[[')).length, 0);
  check('and the one with no target stays as typed', texts.includes('nonexistent-note'), true);
  return { checks, texts, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
