/**
 * A space typed in prose stays as wide as the source says.
 *
 * The fast path writes characters into a text node without rendering. A trailing
 * space and the second of a run cannot be left as ordinary HTML spaces: the browser
 * collapses them, so the caret appears not to move and the source says more than the
 * reader can see. The write itself must use the same visible-space rendering as a
 * freshly built block.
 *
 * @covers src/ui/markdown/editing/context.ts,
 *   src/ui/markdown/editing/typed_text.ts, src/ui/markdown/text_spacing.ts
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

  const placeAt = async (offset) => {
    const leaf = t.textNodesIn(t.blocks()[0])[0];
    const range = document.createRange();
    range.setStart(leaf, offset);
    range.collapse(true);
    const box = range.getBoundingClientRect();
    const at = {
      bubbles: true,
      clientX: box.left,
      clientY: box.top + box.height / 2
    };
    leaf.parentElement.dispatchEvent(new PointerEvent('pointerdown', at));
    leaf.parentElement.dispatchEvent(new PointerEvent('pointerup', at));
    leaf.parentElement.dispatchEvent(new MouseEvent('click', at));
    await t.sleep(120);
  };

  await t.load('one two\n');
  await placeAt('one two'.length);
  t.key(' ');
  await t.sleep(250);
  check('a trailing space remains in the source', await t.raw(), 'one two \n');
  check('and its gap stays visible', t.blocks()[0]?.textContent ?? null, 'one two\u00a0');

  await t.load('onetwo\n');
  await placeAt('one'.length);
  t.key(' ');
  t.key(' ');
  await t.sleep(250);
  check('two spaces in the middle remain in the source', await t.raw(), 'one  two\n');
  check('and the second one stays visible', t.blocks()[0]?.textContent ?? null, 'one \u00a0two');

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
