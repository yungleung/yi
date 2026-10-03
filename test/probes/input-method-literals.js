/**
 * A committed word in the blocks that keep their own rules: a table cell, a fenced
 * code block and an empty display formula.
 *
 * A table cell holds text and not lines; a code block is literal text where a bracket
 * is the author's own character; a display formula's content gets a line of its own
 * (`syntax/math_edits.ts`). A word the system commits lands under those rules too.
 *
 * @covers src/ui/markdown/editing/text_commands.ts, src/ui/markdown/syntax/math_edits.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const seam = () => document.querySelector('.markdown-composition-input');
  const compose = async (word) => {
    const area = seam();
    area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    area.value = word;
    area.dispatchEvent(new CompositionEvent('compositionend', { data: word, bubbles: true }));
    await t.sleep(250);
  };

  await t.load('| a | b |\n| - | - |\n| 1 | 2 |\n');
  await t.click(t.prose().querySelectorAll('[data-table-cell]')[3], 0.99, 0.5);
  await compose('文');
  check('a word commits into a table cell', await t.raw(), '| a | b |\n| - | - |\n| 1 | 2文 |\n');

  await t.load('```\ncode\n```\n');
  await t.click(t.prose().querySelector('pre'), 0.99, 0.5);
  await compose('字');
  check('and into a code block', await t.raw(), '```\ncode字\n```\n');

  await t.load('text\n\n$$\n$$\n\ntail\n');
  await t.click(t.prose().querySelector('[data-display="true"]'), 0.5, 0.5);
  await compose('語');
  check('and into an empty display formula, on its own line',
    await t.raw(),
    'text\n\n$$\n語\n$$\n\ntail\n');

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
