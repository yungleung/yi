/**
 * Enter at the end of a visible section paragraph must not move that paragraph.
 *
 * The citation and wikilink paragraphs are long enough to sit near the bottom of the viewport.
 * Their next paragraph is below the viewport, so a deferred caret reveal can scroll the page
 * solely because the caret moved onto the new line.
 *
 * @covers src/ui/markdown/document/state.ts, src/ui/markdown/document/reference_index.ts,
 *   src/ui/markdown/document/block/parse_cache.ts, src/ui/markdown/editing/caret_placement.ts,
 *   src/ui/markdown/caret/span.ts
 * @fixture test/fixtures/workspace/default-document.md
 * @needs-workspace
 *
 * Run with:
 *   npm run probe -- --with-workspace --fixture default-document.md \
 *     test/probes/section-paragraph-enter-stability.js
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
    await t.sleep(200);
    await frame();
  };
  const close = (actual, expected, tolerance = 1) =>
    Math.abs(actual - expected) <= tolerance;
  const geometry = (paragraph) => {
    const viewport = scroller.getBoundingClientRect();
    const root = t.prose().getBoundingClientRect();
    const topSpacer = t.prose().querySelector('[data-virtual-spacer="top"]');
    const caret = document.querySelector('.markdown-caret')?.getBoundingClientRect() ?? null;
    return {
      scrollTop: scroller.scrollTop,
      contentTop: root.top - viewport.top + scroller.scrollTop,
      topSpacerHeight: topSpacer?.offsetHeight ?? null,
      paragraphTop: paragraph.getBoundingClientRect().top,
      paragraphHeight: paragraph.getBoundingClientRect().height,
      paragraphLineStart: paragraph.dataset.lineStart,
      paragraphLineEnd: paragraph.dataset.lineEnd,
      caretTop: caret?.top ?? null,
      caretBottom: caret?.bottom ?? null,
      firstMounted:
        t.blocks()[0]?.dataset.lineStart ?? null
    };
  };

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

  const clickParagraphEnd = async (paragraph) => {
    const text = t
      .textNodesIn(paragraph)
      .filter((node) => node.data.trim().length > 0)
      .at(-1);
    if (!text) {
      return null;
    }
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
    return rect;
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
    scroller.scrollTop += paragraph.getBoundingClientRect().bottom - (viewport.bottom - 28);
    await t.sleep(800);
    const settledViewport = scroller.getBoundingClientRect();
    scroller.scrollTop +=
      paragraph.getBoundingClientRect().bottom - (settledViewport.bottom - 28);
    await t.sleep(800);

    const end = await clickParagraphEnd(paragraph);
    const current = t
      .blocks()
      .find((candidate) => candidate.textContent.includes(needle));
    const before = {
      ...geometry(current),
      caretBottom: end?.bottom ?? null,
      viewportBottom: scroller.getBoundingClientRect().bottom
    };

    t.key('Enter');
    await t.sleep(450);

    const afterParagraph = t
      .blocks()
      .find((candidate) => candidate.textContent.includes(needle));
    const after = {
      ...(afterParagraph ? geometry(afterParagraph) : {})
    };
    scenarios.push({ label, found: true, before, after });

    check(
      `${label}: the paragraph starts near the bottom`,
      before.viewportBottom - before.caretBottom >= 20 &&
        before.viewportBottom - before.caretBottom <= 40,
      true
    );
    check(
      `${label}: Enter keeps the paragraph at its viewport position`,
      after.paragraphTop !== null && close(after.paragraphTop, before.paragraphTop),
      true
    );
    check(
      `${label}: Enter keeps the page's scroll position`,
      close(after.scrollTop, before.scrollTop),
      true
    );
  };

  await runScenario('citations', 'Pandoc-style citations:');
  await runScenario('wikilinks', 'Wikilinks resolve inside the workspace:');

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name),
    scenarios
  };
})()
