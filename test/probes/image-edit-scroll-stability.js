/**
 * An image above the caret must keep its laid-out height through an edit and while scrolling back to it.
 *
 * The renderer only mounts the blocks around the viewport. `content-visibility: auto` can still
 * collapse a mounted-but-offscreen image when an edit forces layout, then expand it as the reader
 * scrolls near it. That changes the document below the image twice: once after the edit and once
 * when the image paints. The caret must instead keep its viewport position, and every slow scroll
 * step must move the page only by that step.
 *
 * @covers src/styles.css, src/ui/markdown/renderer/measurements.ts,
 *   src/ui/markdown/virtual_block_renderer.ts
 */
(async () => {
  const t = window.__t;
  const api = await t.app('/src/api/session.ts');
  const session = await t.app('/src/services/session/index.ts');
  const rules = await t.app('/src/services/session/rules.ts');
  const previousSession = await api.loadSessionText();
  const checks = [];
  const check = (name, actual, expected, details = undefined) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected),
      ...(details === undefined ? {} : { details })
    });
  const close = (actual, expected, tolerance = 2) =>
    actual !== null && Math.abs(actual - expected) <= tolerance;
  const frame = () =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1125">' +
    '<rect width="1800" height="1125" fill="#3b82f6"/></svg>';
  const image = `data:image/svg+xml;base64,${btoa(svg)}`;
  const target =
    '很早的时候就一直想做一款智能辅助写作编辑器，当时的想法是自动关联相关的文章、笔记等，' +
    '既有知识管理的影子，也有智能推荐的影子。那时候这些概念都还不存在，至少我不知道，' +
    '比方说用于知识管理的 [Zettlekasten](https://zettelkasten.de/introduction/) 方法，' +
    '而深度学习那时候刚用于图像和情感识别，远未达到今天的程度。及我一直希望有一个工具，' +
    '能同时满足三件事：';
  const following = Array.from(
    { length: 80 },
    (_, index) => `第 ${index + 1} 段后续文字，让页面有足够的内容可以滚动。`
  ).join('\n\n');
  const markdown =
    '---\ntitle: CSDN推广\ndate: 2026-11-17\nid: 20261117172747\n---\n\n' +
    '# 从 AI Agent 到可验证开发：我用 Rust、Tauri 和 Markdown 构建研究写作工具 Yi\n\n' +
    '> 摘要：AI Agent 写代码并不稀奇，难的是让它持续写出可维护、\n' +
    '> 可验证的软件。本文复盘我用 AI Agent 开发本地优先 Markdown\n' +
    '> 编辑器 Yi 的过程，介绍它的核心设计、研究写作能力，以及它与 Typora、\n' +
    '> Zettlr 的不同取舍。\n\n' +
    '**文章标签：** AI Agent、Markdown、Tauri、Rust、TypeScript、\n' +
    '开源项目、知识管理、科研写作\n\n' +
    `![主界面](${image})\n\n` +
    '## 一、为什么要再做一个 Markdown 编辑器\n\n' +
    `${target}\n\n${following}\n`;

  const metric = () => {
    const scroller = t.scroller();
    const viewport = scroller.getBoundingClientRect();
    const figure = t.blocks().find((block) => block.querySelector('img'));
    const paragraph = t.blocks().find((block) =>
      block.textContent.includes('很早的时候就一直想做')
    );
    const caret = document.querySelector('.markdown-caret')?.getBoundingClientRect();
    const figureRect = figure?.getBoundingClientRect();
    return {
      scrollTop: Math.round(scroller.scrollTop),
      scrollHeight: Math.round(scroller.scrollHeight),
      caretY: caret ? Math.round(caret.top - viewport.top) : null,
      figureTop: figureRect ? Math.round(figureRect.top - viewport.top) : null,
      figureBottom: figureRect ? Math.round(figureRect.bottom - viewport.top) : null,
      figureHeight: figureRect ? Math.round(figureRect.height) : null,
      paragraphY: paragraph ? Math.round(paragraph.getBoundingClientRect().top - viewport.top) : null
    };
  };

  try {
    await session.documentSession.openFile({ path: null, content: markdown });
    await t.sleep(700);
    const scroller = t.scroller();
    const paragraph = t.blocks().find((block) =>
      block.textContent.includes('很早的时候就一直想做')
    );
    if (!paragraph) {
      return { error: 'target paragraph was not mounted', blocks: t.blocks().length };
    }
    scroller.scrollTop +=
      paragraph.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 80;
    await t.sleep(400);

    const characterNode = t
      .textNodesIn(paragraph)
      .find((node) => node.data.includes('及'));
    const characterAt = characterNode.data.indexOf('及');
    const character = document.createRange();
    character.setStart(characterNode, characterAt);
    character.setEnd(characterNode, characterAt + 1);
    const characterRect = character.getBoundingClientRect();
    const point = {
      bubbles: true,
      cancelable: true,
      clientX: characterRect.right - 1,
      clientY: characterRect.top + characterRect.height / 2
    };
    characterNode.parentElement.dispatchEvent(new PointerEvent('pointerdown', point));
    characterNode.parentElement.dispatchEvent(new PointerEvent('pointerup', point));
    characterNode.parentElement.dispatchEvent(new MouseEvent('click', point));
    await t.sleep(120);

    const before = metric();
    t.key('Backspace');
    await frame();
    await t.sleep(250);
    const afterEdit = metric();
    check(
      'the edit keeps the caret at its viewport position',
      close(afterEdit.caretY, before.caretY),
      true,
      { before, afterEdit }
    );
    check(
      'the offscreen image keeps its laid-out height',
      close(afterEdit.figureHeight, before.figureHeight),
      true,
      { before, afterEdit }
    );
    check(
      'the edit does not move the page',
      close(afterEdit.scrollTop, before.scrollTop),
      true,
      { before, afterEdit }
    );

    const scrolls = [];
    for (let step = 0; step < 40; step += 1) {
      const asked = Math.max(0, Math.round(scroller.scrollTop) - 24);
      scroller.scrollTop -= 24;
      await frame();
      const current = metric();
      scrolls.push({ step, asked, ...current });
      if (current.figureTop >= 80) {
        break;
      }
    }
    const heights = new Set(scrolls.map((entry) => entry.figureHeight));
    check('the image never changes height while scrolling back', heights.size, 1);
    let previous = scrolls[0];
    const lowerEdgeShifted = scrolls.slice(1).some((entry) => {
      const followsScroll = close(entry.figureBottom, previous.figureBottom + 24);
      previous = entry;
      return !followsScroll;
    });
    check('the lower edge of the image follows each scroll step', lowerEdgeShifted, false);
    check(
      'every slow scroll step moves only by that step',
      scrolls.every((entry) => close(entry.scrollTop, entry.asked, 1)),
      true,
      scrolls.filter((entry) => !close(entry.scrollTop, entry.asked, 1))
    );

    return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
  } finally {
    await sleep(900);
    await api.saveSessionText(
      previousSession ?? rules.serializeSession(rules.emptySession())
    );
    await session.documentSession.load();
  }
})()
