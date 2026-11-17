/**
 * Enter confirms a composing word instead of breaking the document's line.
 *
 * A CJK input method can route Enter with `isComposing: false` while its marked text is still
 * active. The event alone therefore cannot answer whether the editor owns the key; the composition
 * seam can. During composition the key belongs to the input method and leaves the document alone.
 * Once the word has committed, an ordinary Enter still starts a new line.
 *
 * @covers src/ui/markdown/editing/keys.ts,
 *   src/ui/markdown/editing/composition/input.ts
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
  const seam = () => document.querySelector('.markdown-composition-input');
  const composing = () => document.querySelector('[data-composing]');

  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);

  const area = seam();
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  area.value = 'ni';
  area.dispatchEvent(
    new CompositionEvent('compositionupdate', { data: 'ni', bubbles: true })
  );
  await t.sleep(150);

  const enter = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true
  });
  Object.defineProperty(enter, 'keyCode', { value: 229 });
  area.dispatchEvent(enter);
  await t.sleep(250);

  check('the input method receives the composing Enter', enter.defaultPrevented, false);
  check('and it does not break the document line', await t.raw(), 'hello\n');
  check('the marked text is still composing', composing()?.textContent ?? null, 'ni');

  area.value = '你';
  area.dispatchEvent(
    new CompositionEvent('compositionend', { data: '你', bubbles: true })
  );
  await t.sleep(250);
  check('choosing the candidate commits only the word', await t.raw(), 'hello你\n');

  t.key('Enter');
  await t.sleep(250);
  check('an Enter after composition still starts a line', await t.raw(), 'hello你\n\n');

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
