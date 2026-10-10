/**
 * A block that changes shape under a click keeps its height on every frame it is painted.
 *
 * A click on a citation or a wikilink rebuilds its paragraph as a second *shape* of the same
 * block, and the rebuild puts a fresh element in the document. A block is `content-visibility:
 * auto`, and the browser settles whether a new element is on screen at the end of the frame — so
 * until then the element reports its own `contain-intrinsic-size` instead of its height, and the
 * paragraph is painted at the fallback for exactly one frame. Seeded from the line-count estimate
 * that fallback is 176px against a real 156px for this paragraph: the block twitches, everything
 * below it moves by a line, and for that frame nothing is painted at all (the layout read below
 * cannot see the blank — it reads the 176 — which is why this probe watches the height over frames
 * and `docs/testing.md` keeps the native capture beside it).
 *
 * Only the height is asserted here; the capture of the pixels is a person's measurement. The tree
 * opens the workspace's own documents first because that is the reader's path, and the state the
 * window is in when it happens (`--with-workspace`: the citations and the wikilinks are in the
 * default document).
 *
 * @covers src/ui/markdown/virtual_block_renderer.ts, src/ui/markdown/block_sizes.ts
 * @needs-workspace
 * @needs-foreground-window — the frame trace needs a window that is not occluded: an occluded
 * webview suspends animation frames and the trace comes back empty.
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
  const blockWith = (text) =>
    [...document.querySelectorAll('.prose .markdown-block')].find((block) =>
      (block.textContent ?? '').includes(text)
    );
  const citationOf = () =>
    [...t.prose().querySelectorAll('.markdown-citation')].find((element) =>
      /smith2020|Smith/.test(element.textContent ?? '')
    ) ?? null;
  const wikilinkOf = () => t.prose().querySelector('.markdown-wikilink');

  check('the tree offers README.md', await openFromTree('README.md'), true);
  check('and the default document', await openFromTree('default-document.md'), true);
  // The caret goes somewhere plain first: a document opened with the caret already inside a
  // citation shows that citation as its own source, and a citation that is its own source has no
  // rendering here to click.
  const first = document.querySelector('.prose .markdown-block');
  if (first) {
    await t.click(first, 0.9);
  }
  await t.sleep(300);
  let section = blockWith('Pandoc-style citations');
  for (let step = 0; step < 25 && !section; step += 1) {
    t.scroller().scrollTop += 200;
    await t.sleep(110);
    section = blockWith('Pandoc-style citations');
  }
  section?.scrollIntoView({ block: 'center' });
  // The document settles the way it is when a reader finally clicks: the window stops turning over
  // and the paragraph is laid out at its measured height.
  await t.sleep(1200);
  check('the citations paragraph is mounted', Boolean(section), Boolean(section));
  check('with a citation the library can answer', Boolean(citationOf()), Boolean(citationOf()));

  const frames = [];
  let running = true;
  const sample = () => {
    if (!running) {
      return;
    }
    const block = blockWith('is not a citation');
    frames.push({
      scrollTop: Math.round(t.scroller().scrollTop),
      scrollHeight: Math.round(t.scroller().scrollHeight),
      height: block ? Math.round(block.getBoundingClientRect().height) : -1,
      intrinsic: block ? block.style.containIntrinsicSize : null,
      citationSource: Boolean(document.querySelector('.markdown-citation-source')),
      wikilinkSource: Boolean(document.querySelector('.markdown-wikilink-source'))
    });
    requestAnimationFrame(sample);
  };
  /** Clicks `pick()` the way a reader does: from the point they see it at. */
  const click = async (pick) => {
    const element = pick();
    if (!element) {
      return false;
    }
    const box = element.getBoundingClientRect();
    const at = {
      clientX: Math.round(box.left + box.width / 2),
      clientY: Math.round(box.top + box.height / 2)
    };
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, ...at }));
    await t.sleep(260);
    element.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window, ...at })
    );
    await t.sleep(700);
    return true;
  };

  requestAnimationFrame(sample);
  // A few frames before the first click, so the settled height is read from the state the reader
  // clicks in rather than from a number written into this probe.
  await t.sleep(150);
  const settled = frames[frames.length - 1].height;
  const clicked = [
    await click(citationOf),
    await click(wikilinkOf),
    await click(citationOf)
  ];
  running = false;

  check('all three clicks found their target', clicked.every(Boolean), clicked);
  check(
    'the clicks revealed a citation and a wikilink',
    frames.some((frame) => frame.citationSource) && frames.some((frame) => frame.wikilinkSource),
    {
      citation: frames.some((frame) => frame.citationSource),
      wikilink: frames.some((frame) => frame.wikilinkSource)
    }
  );
  const offHeight = frames.filter((frame) => frame.height !== settled);
  check('the paragraph never leaves its settled height', offHeight.length === 0, {
    settled,
    frames: offHeight.slice(0, 8)
  });
  const heights = [...new Set(frames.map((frame) => frame.height))];
  check('so its `contain-intrinsic-size` names that height too', heights.length === 1, heights);

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name),
    // Context, not an assertion: the document's height settles as the window turns over and its
    // blocks are measured, so it moves here whether or not a block was written down wrong. A block
    // written down at the estimate inflates it by that block's error, which is the page shift.
    documentHeights: [...new Set(frames.map((frame) => frame.scrollHeight))],
    scrollTops: [...new Set(frames.map((frame) => frame.scrollTop))]
  };
})()
