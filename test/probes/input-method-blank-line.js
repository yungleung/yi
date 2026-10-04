/**
 * A word composed on a paragraph the reader has just made commits into it.
 *
 * Enter at the end of the document leaves a blank line, and its paragraph is drawn as a
 * placeholder rather than characters. A word being composed is written into the line, and at a
 * text node's *edge* that must go beside the node rather than into a split: splitting at the
 * very start leaves an empty text node, a caret anchored in one is moved to the *element* when
 * the halves are joined again, and the offsets mapping cannot read an element-anchored caret —
 * so the commit found no offsets and wrote nothing at all (measured: the line stayed empty).
 *
 * @covers src/ui/markdown/editing/composition_view.ts: insertAt
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const seam = () => document.querySelector('.markdown-composition-input');
  const composing = () => document.querySelector('[data-composing]');

  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);
  t.key('Enter');
  await t.sleep(250);
  check('Enter leaves a blank line after the last one', await t.raw(), 'hello\n\n');

  const area = seam();
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  area.value = 'ni';
  area.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'ni', bubbles: true }));
  await t.sleep(200);
  check('the word is written on the blank line', composing()?.textContent ?? null, 'ni');
  check('and the document is untouched while it is composed', await t.raw(), 'hello\n\n');

  area.value = '你';
  area.dispatchEvent(new CompositionEvent('compositionend', { data: '你', bubbles: true }));
  await t.sleep(300);
  check('the word lands on its own line', await t.raw(), 'hello\n\n你\n');
  check('and nothing is left in the page', t.prose().querySelectorAll('[data-composing]').length, 0);

  // The same at the *end* of an existing line, which is the other edge of a text node.
  await t.load('hello world\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);
  const area2 = seam();
  area2.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  area2.value = 'ni';
  area2.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'ni', bubbles: true }));
  await t.sleep(200);
  area2.value = '你';
  area2.dispatchEvent(new CompositionEvent('compositionend', { data: '你', bubbles: true }));
  await t.sleep(300);
  check('and at the end of a written line', await t.raw(), 'hello world你\n');

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
