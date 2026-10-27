/**
 * Keys typed while a rebuilt line or a source reveal is taking the input context.
 *
 * WebKit reports printable keys as keyCode 229 for a short window after that handoff,
 * even without a composition or `input` event. Those keys belong to the editor
 * and must arrive at the caret the new view has placed. The same 229 key outside
 * that window belongs to the input method.
 *
 * @covers src/ui/markdown/editing/composition_input.ts,
 *   src/ui/markdown/editing/context.ts, src/ui/markdown/editing/keys.ts,
 *   src/ui/markdown/markdown_editor.ts
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
  const press229 = (character) =>
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', {
        key: character,
        keyCode: 229,
        bubbles: true,
        cancelable: true
      })
    );

  await t.load('Alpha\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(250);
  t.key('Enter');
  for (const character of 'quick') {
    press229(character);
  }
  await t.sleep(300);
  check('printable 229 keys during a rebuild are not lost', await t.raw(), 'Alpha\n\nquick\n');

  await t.load('Alpha\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(250);
  t.key('Enter');
  await t.sleep(80);
  press229('x');
  await t.sleep(300);
  check('a 229 key after the next frame is still part of the rebuild', await t.raw(), 'Alpha\n\nx\n');

  await t.load('Alpha\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(250);
  t.key('Enter');
  await t.sleep(300);
  press229('你');
  await t.sleep(200);
  check('a printable 229 key outside a rebuild stays with the input method', await t.raw(), 'Alpha\n\n');

  await t.load('Before [title](https://example.com) after\n');
  const opening = t.click(t.prose().querySelector('a.markdown-link'), 0.72, 0.5);
  for (const character of 'abc') {
    press229(character);
  }
  await opening;
  await t.sleep(300);
  const sourceCaret = (await t.app('/src/ui/markdown/caret/caret.ts')).getCaretRange();
  check(
    'the caret stays after characters typed while a source opens',
    sourceCaret === null
      ? null
      : {
          inSource:
            sourceCaret.startContainer.parentElement?.closest('.markdown-link-source') !== null,
          offset: sourceCaret.startOffset
        },
    { inSource: true, offset: 9 }
  );
  check(
    'and those characters land at that source position',
    await t.raw(),
    'Before [titleabc](https://example.com) after\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
