/**
 * A display formula's source view, held to a fenced code block's behaviour.
 *
 * The source a fenced block shows while the caret is inside it is the block's own text, its
 * delimiters included (`nodes/fence_text.ts`): the `$$` are the author's characters, drawn as the
 * markup they are, and the caret maps through them like any other character.
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const raw = () => t.raw();
  const formula = () => t.prose().querySelector('[data-display="true"]');
  const source = () => t.prose().querySelector('.markdown-source-text');
  // Each block's own characters. A fenced block carries its label as chrome inside its container
  // (`nodes/fence_label.ts`), and the label is not part of what the block shows.
  const blockTexts = () =>
    [...t.prose().querySelectorAll('.markdown-block')].map((block) => {
      const copy = block.cloneNode(true);
      for (const chrome of copy.querySelectorAll('[data-chrome]')) {
        chrome.remove();
      }
      return copy.textContent;
    });
  const doc = 'text\n\n$$\n\\frac{a}{b}\n+ c\n$$\n\ntail\n';
  await t.load(doc);

  // 1. The click shows the block's own text with the caret at the end of the
  // last content line: typing lands there and both fences stay put.
  await t.click(formula(), 0.5, 0.5);
  check('the block shows its own text, delimiters and all', source()?.textContent ?? null, '$$\n\\frac{a}{b}\n+ c\n$$');
  t.key('X');
  await t.sleep(300);
  check('typing lands on the content line', await raw(), 'text\n\n$$\n\\frac{a}{b}\n+ cX\n$$\n\ntail\n');
  check('the block is whole', blockTexts().length, 3);

  // 2. Enter at the end of that line makes a blank line inside the formula.
  t.key('Enter');
  await t.sleep(400);
  check(
    'Enter makes a blank line inside the formula',
    await raw(),
    'text\n\n$$\n\\frac{a}{b}\n+ cX\n\n$$\n\ntail\n'
  );
  // Still one block, and it shows its own body: the fences are not drawn, so what the element
  // holds is the characters between them.
  checks.push({
    name: 'the block is still one block',
    actual: blockTexts(),
    expected: ['text', '$$\n\\frac{a}{b}\n+ cX\n\n$$', 'tail'],
    pass: JSON.stringify(blockTexts()) === JSON.stringify(['text', '$$\n\\frac{a}{b}\n+ cX\n\n$$', 'tail'])
  });
  t.key('Z');
  await t.sleep(300);
  check(
    'typing goes on the line the Enter made',
    await raw(),
    'text\n\n$$\n\\frac{a}{b}\n+ cX\nZ\n$$\n\ntail\n'
  );

  // 3. Cleaning the line up leaves the `$$` exactly as they were: the Z goes
  // on the first Backspace, the blank line on the second, and the caret ends
  // at the end of the line above — inside the formula, not beside its fence.
  t.key('Backspace');
  await t.sleep(300);
  check(
    'deleting leaves the fence its own line',
    await raw(),
    'text\n\n$$\n\\frac{a}{b}\n+ cX\n\n$$\n\ntail\n'
  );
  t.key('Backspace');
  await t.sleep(300);
  check(
    'and the blank line goes with it',
    await raw(),
    'text\n\n$$\n\\frac{a}{b}\n+ cX\n$$\n\ntail\n'
  );
  t.key('Backspace');
  await t.sleep(300);
  check('and the formula is back to what it was', await raw(), doc);

  // Undo and redo rebuild the block like an edit does, and the block is still
  // the block that shows its own text.
  await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'undo' });
  await t.sleep(300);
  check('undo brings the typo back', await raw(), doc.replace('+ c', '+ cX'));
  await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'redo' });
  await t.sleep(400);
  check('redo takes it away again', await raw(), 'text\n\n$$\n\\frac{a}{b}\n+ c\n$$\n\ntail\n');
  check('and the block still shows its own text', source()?.textContent ?? null, '$$\n\\frac{a}{b}\n+ c\n$$');

  // 4. Clicking away renders the formula again, with the document intact.
  const tail = [...t.prose().querySelectorAll('.markdown-block')].pop();
  await t.click(tail, 0.5);
  await t.sleep(400);
  check('the formula renders again', formula() !== null, true);
  check('and the source view is gone', source(), null);
  check('with the document untouched', await raw(), doc);

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
