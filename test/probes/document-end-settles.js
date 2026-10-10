/**
 * Scrolling to the end of a document leaves the reader at the end, and a click there moves nothing.
 *
 * Blocks are laid out with estimates until they are measured, and the reader's place is remembered
 * as a *document* offset rather than a pixel (`virtual_block_renderer.ts: scrollAnchor`), so a
 * height that moves under them is a pixel position that moves under them. At the end of a document
 * there is no range left to absorb it, so the reader sees the page jump by the few lines the height
 * changed — measured on the reader's path: three scrolls to the end left the view at 1547 of a
 * possible 1611, with the document still growing round by round, and a click on a citation there
 * moved the page again.
 *
 * The tree opens the workspace's own documents first because that is the reader's path, and the
 * click needs a citation the library can answer (`--with-workspace`).
 *
 * @covers src/ui/markdown/virtual_block_renderer.ts, src/ui/markdown/block_sizes.ts
 * @needs-workspace
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
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
  const scroller = t.scroller();
  const place = () => ({
    scrollTop: Math.round(scroller.scrollTop),
    max: Math.round(scroller.scrollHeight - scroller.clientHeight),
    scrollHeight: Math.round(scroller.scrollHeight)
  });
  const onScreen = (element) => {
    const box = element.getBoundingClientRect();
    return box.top >= 8 && box.bottom <= window.innerHeight - 8;
  };

  check('the tree offers README.md', await openFromTree('README.md'), true);
  check('and the default document', await openFromTree('default-document.md'), true);
  const first = document.querySelector('.prose .markdown-block');
  if (first) {
    await t.click(first, 0.9);
  }
  await t.sleep(300);

  // The reader's way to the end: scroll there, and keep going there as the page finds its height.
  const rounds = [];
  for (let round = 0; round < 3; round += 1) {
    scroller.scrollTop = scroller.scrollHeight;
    await t.sleep(900);
    rounds.push(place());
  }
  const last = rounds[rounds.length - 1];
  check('scrolling to the end lands at the end', last.max - last.scrollTop <= 2, rounds);
  check(
    'and the place stops moving',
    rounds[rounds.length - 1].scrollTop === rounds[rounds.length - 2].scrollTop &&
      rounds[rounds.length - 1].scrollHeight === rounds[rounds.length - 2].scrollHeight,
    rounds.slice(-2)
  );

  // A click on a citation the reader can see, at the end, moves neither the page nor the document.
  const citation = [...t.prose().querySelectorAll('.markdown-citation')].find(onScreen) ?? null;
  check('a citation is on screen at the end', Boolean(citation), Boolean(citation));
  if (citation) {
    const box = citation.getBoundingClientRect();
    const at = {
      clientX: Math.round(box.left + box.width / 2),
      clientY: Math.round(box.top + box.height / 2)
    };
    citation.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, ...at }));
    await t.sleep(300);
    const before = place();
    citation.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window, ...at })
    );
    await t.sleep(900);
    const after = place();
    check('and the click leaves the page where it was', after.scrollTop === before.scrollTop, {
      before,
      after
    });
    check('with the document the height it had', after.scrollHeight === before.scrollHeight, {
      before,
      after
    });
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
