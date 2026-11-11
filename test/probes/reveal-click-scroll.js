/**
 * A click that opens a citation or a wikilink does not move the page.
 *
 * A node whose rendering cannot hold a caret — a formatted citation, a wikilink's
 * title — is opened as its own source by a click, and that rebuilds the block it
 * sits in. A block rebuilt at the very bottom of the visible area is where the
 * browser then moves the view: measured on the app, with the demo document's
 * thematic break 4px below the fold, a click on the lowest visible citation moved
 * the scroll by **23px** a frame later, with the layout unchanged and the caret on
 * screen. An edit already answers this (`editing/context.ts: keepScroll`); a click
 * that opens a source did not, which is what this holds.
 *
 * The document matters: the demo document's citations and wikilinks end two blocks
 * above its thematic break, so putting that rule just below the fold puts a
 * citation and a wikilink on the last visible line — the arrangement the user's
 * report is about. Every click here must still *open* its node as a source, so the
 * probe cannot pass by doing nothing.
 *
 * @covers src/ui/markdown/markdown_editor.ts (enterSource), src/ui/markdown/editing/context.ts (keepScroll)
 * @fixture test/fixtures/workspace/default-document.md
 * @needs-workspace
 *
 * Run it by name: npm run probe -- --with-workspace --fixture default-document.md \
 *   test/probes/reveal-click-scroll.js
 */
(async () => {
  const t = window.__t;
  const scroller = t.scroller();
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  /** Scrolls so the rule sits `gap` px below the viewport's bottom edge. */
  const placeRuleBelow = async (rule, gap) => {
    for (let step = 0; step < 6; step += 1) {
      const box = scroller.getBoundingClientRect();
      const rect = rule.getBoundingClientRect();
      const wanted = rect.top - (box.bottom + gap);
      if (Math.abs(wanted) < 3) {
        break;
      }
      scroller.scrollTop += Math.round(wanted);
      await t.sleep(400);
    }
    await t.sleep(1200);
  };
  /**
   * Brings the document's thematic break just below the fold **the way a reader
   * reaches it**: scroll down through the document until the rule is near the
   * bottom edge, then close the last few pixels. The direction is the point —
   * arriving at the same arrangement by scrolling *up* from the end of the
   * document does not move the view on a click (measured), which says the window
   * the reader came through is part of what the view does.
   */
  const bringRuleToTheFold = async () => {
    for (let fraction = 0.1; fraction <= 1.0001; fraction += 0.02) {
      scroller.scrollTop = Math.round(scroller.scrollHeight * fraction);
      await t.sleep(100);
      const rule = t.prose().querySelector('hr')?.closest('.markdown-block') ?? null;
      if (!rule) {
        continue;
      }
      const box = scroller.getBoundingClientRect();
      if (rule.getBoundingClientRect().top <= box.bottom + 60) {
        await placeRuleBelow(rule, 4);
        return rule;
      }
    }
    return null;
  };
  /** The lowest node of `selector` that is fully inside the visible area. */
  const lowestVisible = (selector) => {
    const box = scroller.getBoundingClientRect();
    return (
      [...t.prose().querySelectorAll(selector)]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.top >= box.top && rect.bottom <= box.bottom;
        })
        .filter((element) => element.getBoundingClientRect().height > 0)
        .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] ?? null
    );
  };

  const cases = [
    { name: 'a citation', selector: '.markdown-citation, .markdown-citation-placeholder' },
    { name: 'a wikilink', selector: '.markdown-wikilink' }
  ];

  for (const shape of cases) {
    // The document is the one the harness loaded (the demo document, under `probe:all`). It is
    // *not* loaded again when there is none: `--with-doc`/`--fixture` are what name one, and a
    // by-name run without them would otherwise load nothing — over the document the reader had
    // open, which is a change of its own.
    if (typeof window.__probeDoc === 'string' && window.__probeDoc !== '') {
      await t.load(window.__probeDoc);
    }
    const rule = await bringRuleToTheFold();
    check(`${shape.name}: the demo document has the rule to put below the fold`, rule !== null, rule !== null);
    if (!rule) {
      continue;
    }
    await placeRuleBelow(rule, 4);
    const node = lowestVisible(shape.selector);
    const box = scroller.getBoundingClientRect();
    check(
      `${shape.name}: one sits on the last visible line, with the rule just below`,
      node !== null && Math.round(rule.getBoundingClientRect().top) > Math.round(box.bottom),
      {
        node: node ? t.rectOf(node) : null,
        rule: t.rectOf(rule),
        box: { top: Math.round(box.top), bottom: Math.round(box.bottom) }
      }
    );
    if (!node) {
      continue;
    }
    const before = Math.round(scroller.scrollTop);
    const rect = node.getBoundingClientRect();
    const options = {
      bubbles: true,
      cancelable: true,
      clientX: Math.round(rect.left + rect.width / 2),
      clientY: Math.round(rect.top + rect.height / 2)
    };
    node.dispatchEvent(new MouseEvent('mousedown', { ...options, button: 0 }));
    node.dispatchEvent(new MouseEvent('mouseup', { ...options, button: 0 }));
    node.dispatchEvent(new MouseEvent('click', { ...options, button: 0 }));
    await t.sleep(700);
    const after = Math.round(scroller.scrollTop);
    check(
      `${shape.name}: a click on it leaves the page where it was`,
      Math.abs(after - before) <= 1,
      { before, after, delta: after - before, rule: t.rectOf(rule) }
    );
    check(
      `${shape.name}: and it still opens that node as its own source`,
      t.prose().querySelector('.markdown-source-view') !== null,
      [...t.prose().querySelectorAll('.markdown-source-view')].map((span) =>
        span.textContent?.slice(0, 24)
      )
    );
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
