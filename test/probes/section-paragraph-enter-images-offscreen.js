/**
 * Enter at a section paragraph must not move it when the nearby pictures are above the viewport.
 *
 * Image-bearing blocks keep their intrinsic height while mounted, but pictures outside the visible
 * area can still settle after a nearby structural edit. The section paragraph must stay fixed.
 *
 * @covers src/ui/markdown/virtual_block_renderer.ts, src/ui/markdown/editor/history.ts,
 *   src/ui/markdown/create_block.ts, src/ui/markdown/renderer/measurements.ts,
 *   src/ui/markdown/editing/caret_placement.ts
 * @fixture test/fixtures/workspace/default-document.md
 * @needs-workspace
 *
 * Run with:
 *   npm run probe -- --with-workspace --fixture default-document.md \
 *     test/probes/section-paragraph-enter-images-offscreen.js
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const scroller = t.scroller();
  const frame = () =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const settle = async () => {
    await frame();
    await t.sleep(500);
    await frame();
  };
  const close = (actual, expected, tolerance = 1) =>
    Math.abs(actual - expected) <= tolerance;

  const findParagraph = async (needle) => {
    scroller.scrollTop = 0;
    await settle();
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const block = t
        .blocks()
        .find((candidate) => candidate.textContent.includes(needle));
      if (block) {
        return block;
      }
      scroller.scrollTop = Math.min(
        scroller.scrollHeight,
        scroller.scrollTop + Math.max(1, scroller.clientHeight * 0.75)
      );
      await settle();
    }
    return null;
  };

  const pictures = () =>
    [...t.prose().querySelectorAll('figure.markdown-figure, img')]
      .map((element) => ({
        element,
        box: element.getBoundingClientRect()
      }))
      .filter(({ element, box }) => element.isConnected && box.height > 0);

  const clickParagraphEnd = async (paragraph) => {
    const text = t
      .textNodesIn(paragraph)
      .filter((node) => node.data.trim().length > 0)
      .at(-1);
    const range = document.createRange();
    range.setStart(text, text.data.length);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    const at = {
      bubbles: true,
      cancelable: true,
      clientX: rect.right,
      clientY: rect.top + rect.height / 2
    };
    paragraph.dispatchEvent(new PointerEvent('pointerdown', at));
    paragraph.dispatchEvent(new PointerEvent('pointerup', at));
    paragraph.dispatchEvent(new MouseEvent('click', at));
    await t.sleep(250);
  };

  const snapshot = (paragraph) => {
    const viewport = scroller.getBoundingClientRect();
    const currentPictures = pictures();
    const topSpacer = t.prose().querySelector('[data-virtual-spacer="top"]');
    const bottomSpacer = t.prose().querySelector('[data-virtual-spacer="bottom"]');
    const root = t.prose().getBoundingClientRect();
    return {
      paragraphTop: paragraph.getBoundingClientRect().top,
      paragraphBottom: paragraph.getBoundingClientRect().bottom,
      scrollTop: scroller.scrollTop,
      contentTop: root.top - viewport.top + scroller.scrollTop,
      topSpacerHeight: topSpacer?.offsetHeight ?? null,
      bottomSpacerHeight: bottomSpacer?.offsetHeight ?? null,
      firstMounted: t.blocks()[0]?.dataset.lineStart ?? null,
      lastMounted: t.blocks().at(-1)?.dataset.lineStart ?? null,
      mountedBlocks: t.blocks().length,
      viewportTop: viewport.top,
      viewportBottom: viewport.bottom,
      pictureBottom: Math.max(
        ...currentPictures.map(({ box }) => box.bottom)
      ),
      pictureHeights: currentPictures.map(({ box }) => Math.round(box.height))
    };
  };

  const scenarios = [];
  const runScenario = async (label, needle) => {
    await t.load(window.__probeDoc);
    await settle();
    const paragraph = await findParagraph(needle);
    if (!paragraph) {
      scenarios.push({ label, found: false });
      check(`${label}: the section paragraph is mounted`, false, true);
      return;
    }

    const viewport = scroller.getBoundingClientRect();
    const mountedPictures = pictures();
    const furthestBottom = Math.max(
      ...mountedPictures.map(({ box }) => box.bottom)
    );
    scroller.scrollTop += furthestBottom - viewport.top + 48;
    await settle();

    const current = t
      .blocks()
      .find((candidate) => candidate.textContent.includes(needle));
    const before = snapshot(current);
    await clickParagraphEnd(current);
    const afterClick = snapshot(current);

    t.key('Enter');
    await t.sleep(450);

    const afterParagraph = t
      .blocks()
      .find((candidate) => candidate.textContent.includes(needle));
    const afterEnter = afterParagraph ? snapshot(afterParagraph) : {};
    scroller.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        code: 'KeyZ',
        bubbles: true,
        cancelable: true,
        ...(t.platform() === 'macos' ? { metaKey: true } : { ctrlKey: true })
      })
    );
    await t.sleep(450);
    const undoneParagraph = t
      .blocks()
      .find((candidate) => candidate.textContent.includes(needle));
    const afterUndo = undoneParagraph ? snapshot(undoneParagraph) : {};
    scenarios.push({ label, found: true, before, afterClick, afterEnter, afterUndo });

    check(
      `${label}: the nearby pictures are above the viewport`,
      before.pictureBottom < before.viewportTop,
      true
    );
    check(
      `${label}: Enter keeps the paragraph at its viewport position`,
      afterEnter.paragraphTop !== undefined &&
        close(afterEnter.paragraphTop, afterClick.paragraphTop),
      true
    );
    check(
      `${label}: Enter keeps the page's scroll position`,
      afterEnter.scrollTop !== undefined && close(afterEnter.scrollTop, afterClick.scrollTop),
      true
    );
    check(
      `${label}: the offscreen pictures keep their heights`,
      afterEnter.pictureHeights !== undefined &&
        JSON.stringify(afterEnter.pictureHeights) === JSON.stringify(before.pictureHeights),
      true
    );
    check(
      `${label}: Undo keeps the paragraph at its viewport position`,
      afterUndo.paragraphTop !== undefined &&
        close(afterUndo.paragraphTop, afterEnter.paragraphTop),
      true
    );
    check(
      `${label}: Undo keeps the page's scroll position`,
      afterUndo.scrollTop !== undefined && close(afterUndo.scrollTop, afterEnter.scrollTop),
      true
    );
    check(
      `${label}: Undo keeps the offscreen picture heights`,
      afterUndo.pictureHeights !== undefined &&
        JSON.stringify(afterUndo.pictureHeights) === JSON.stringify(before.pictureHeights),
      true
    );
  };

  await runScenario('citations with offscreen pictures', 'Pandoc-style citations:');
  await runScenario('wikilinks with offscreen pictures', 'Wikilinks resolve inside the workspace:');

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name),
    scenarios
  };
})()
