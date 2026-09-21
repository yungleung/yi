/**
 * The thematic break: the chord writes a `---` line of its own where the caret
 * is, with the blank lines markdown needs to read it as a rule — one glued to
 * the line above is a setext heading — and the block renders as a rule.
 *
 * @covers src/ui/markdown/editing/thematic_break.ts, src/ui/markdown/commands/keymap.ts
 */
(async () => {
  const t = window.__t;

  /** Puts the caret in the text node holding `needle`, `inside` characters in. */
  const caretAt = async (needle, inside) => {
    const block = t.blocks().find((element) => element.textContent.includes(needle));
    const node = t.textNodesIn(block).find((candidate) => candidate.data.includes(needle));
    const range = document.createRange();
    range.setStart(node, node.data.indexOf(needle) + inside);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: rect.left,
        clientY: rect.top + rect.height / 2
      })
    );
    await t.sleep(120);
  };

  /** The chord, and what the document and the rendering look like after it. */
  const rule = async () => {
    t.scroller().dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'R',
        shiftKey: true,
        metaKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    await t.sleep(250);
    const block = t.blocks().find((element) => element.querySelector('hr'));
    const shown = {
      // The rule's own block: the third line, holding the rule and no text.
      ruleLine: block ? Number(block.dataset.lineStart) : null,
      ruleText: block ? block.textContent : null,
      rules: t.prose().querySelectorAll('hr').length,
      caret: t.caretRect(),
      // Below the rule, where the author goes on writing.
      caretUnderRule: block
        ? t.caretRect().y >= block.querySelector('hr').getBoundingClientRect().bottom
        : false
    };
    t.report({ shown });
    return { ...shown, raw: await t.raw() };
  };

  const checks = {};
  const failed = [];
  const expect = (name, after, raw) => {
    checks[name] = after;
    if (
      after.raw !== raw ||
      after.rules !== 1 ||
      after.ruleLine !== 3 ||
      after.ruleText !== '' ||
      !after.caretUnderRule
    ) {
      failed.push(name);
    }
  };

  await t.load('first line\n\nsecond line\n');
  await caretAt('first line', 'first line'.length);
  expect('betweenParagraphs', await rule(), 'first line\n\n---\n\nsecond line\n');

  await t.load('only line\n');
  await caretAt('only line', 'only line'.length);
  expect('atTheEnd', await rule(), 'only line\n\n---\n\n');

  return { checks, failed };
})()
