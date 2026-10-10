/**
 * A click on a citation or a wikilink shows its own source, and its block stays on the page.
 *
 * The click asks for a shape change, and that rebuilds the block, so the assertion is that the
 * paragraph is still mounted afterwards — with its neighbours, in the same window. A rebuild that
 * leaves the block out is a blank paragraph to the reader: its space is still there (in a spacer)
 * and the text does not come back until the window's range changes, which is a scroll far enough —
 * a small one does not, from the window the tree leaves behind.
 *
 * The tree opens the workspace's own documents first, because that state is what reproduces it:
 * `README.md`, then the default document, is the path a reader takes, and it is the one where the
 * window is partial enough for the drop (`--with-workspace`; the citations and the wikilinks are
 * in the default document).
 *
 * @covers src/ui/markdown/virtual_block_renderer.ts, src/ui/markdown/editing/context.ts,
 *   src/ui/markdown/markdown_editor.ts, src/ui/markdown/source_mode.ts
 * @needs-workspace
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const lines = () =>
    [...document.querySelectorAll('.prose .markdown-block')].map((block) => block.dataset.lineStart);
  /**
   * Opens a workspace file the reader's way: the tree. The row is looked up again on every turn,
   * because opening a document re-renders the tree and the row element the last click used is
   * gone — a click on that one is a click on nothing.
   */
  const openFromTree = async (name) => {
    const rowFor = () =>
      [...document.querySelectorAll('[data-tree-path]')].find(
        (row) => (row.dataset.treePath ?? '').split('/').pop() === name
      );
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const row = rowFor();
      if (row) {
        row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await t.sleep(1100);
        return true;
      }
      await t.sleep(100);
    }
    return false;
  };
  const blockWith = (text) =>
    [...document.querySelectorAll('.prose .markdown-block')].find((block) =>
      (block.textContent ?? '').includes(text)
    );
  const pointOf = (element) => {
    const box = element.getBoundingClientRect();
    return {
      clientX: Math.round(box.left + box.width / 2),
      clientY: Math.round(box.top + box.height / 2)
    };
  };
  /** Rests the pointer on it, then clicks it: what the reader does. */
  const show = async (element) => {
    const point = pointOf(element);
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, ...point }));
    await t.sleep(300);
    element.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window, ...point })
    );
    await t.sleep(450);
  };

  check('the tree offers README.md', await openFromTree('README.md'), true);
  check('and the default document', await openFromTree('default-document.md'), true);
  // The caret goes somewhere plain first: a document opened with the caret already inside a
  // citation shows that citation as its own source, and a citation that is its own source has
  // no rendering here to click.
  const first = document.querySelector('.prose .markdown-block');
  if (first) {
    await t.click(first, 0.9);
  }
  await t.sleep(300);
  let section = blockWith('Pandoc-style citations');
  for (let step = 0; step < 25 && !section; step += 1) {
    t.scroller().scrollTop += 200;
    await t.sleep(100);
    section = blockWith('Pandoc-style citations');
  }
  section?.scrollIntoView({ block: 'center' });
  await t.sleep(450);

  // Either shape: `[@smith2020]` while the bibliography is still arriving, `(Smith, 2020)` after
  // it — the click takes the same path into the source from both.
  const citation =
    [...t.prose().querySelectorAll('.markdown-citation')].find((element) =>
      /smith2020|Smith/.test(element.textContent ?? '')
    ) ?? null;
  check(
    'the citations section is on screen with a citation the library can answer',
    Boolean(section && citation),
    { section: Boolean(section), citation: Boolean(citation) }
  );
  const citationsBefore = lines();
  if (citation) {
    await show(citation);
  }
  check(
    'clicking a citation shows its own source',
    Boolean(t.prose().querySelector('.markdown-citation-source')),
    Boolean(t.prose().querySelector('.markdown-citation-source'))
  );
  check(
    'and the citations paragraph is still mounted',
    lines().includes('70'),
    { before: citationsBefore, after: lines() }
  );

  const wikilink = document.querySelector('.markdown-wikilink');
  check('a wikilink is mounted below it', Boolean(wikilink), Boolean(wikilink));
  const wikilinksBefore = lines();
  if (wikilink) {
    await show(wikilink);
  }
  check('and the wikilinks paragraph is still mounted', lines().includes('78'), {
    before: wikilinksBefore,
    after: lines()
  });
  check('and the citations paragraph did not leave with it', lines().includes('70'), lines());

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
