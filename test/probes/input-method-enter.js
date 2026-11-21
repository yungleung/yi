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

  // The input method's field value is the system's default committed text. A differing
  // `compositionend.data` must not reinterpret it into a candidate the system did not choose.
  area.dispatchEvent(
    new CompositionEvent('compositionend', { data: '你', bubbles: true })
  );
  const repeatedEnter = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true
  });
  Object.defineProperty(repeatedEnter, 'keyCode', { value: 13 });
  area.dispatchEvent(repeatedEnter);
  // The same Enter can reach the native field again after compositionend as a line break.
  await t.sleep(120);
  area.value = '\n';
  area.dispatchEvent(
    new InputEvent('input', {
      data: '\n',
      inputType: 'insertLineBreak',
      bubbles: true
    })
  );
  area.dispatchEvent(
    new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true })
  );
  await t.sleep(250);
  check('the system default commits without being reinterpreted', await t.raw(), 'helloni\n');
  check('the repeated keydown does not break the line', repeatedEnter.defaultPrevented, true);

  t.key('Enter');
  await t.sleep(250);
  check('an Enter after composition still starts a line', await t.raw(), 'helloni\n\n');

  // macOS WebKit ends this composition first, then sends the committing Enter with its browser
  // code (229) but `isComposing: false`.
  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);
  const lateArea = seam();
  lateArea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  lateArea.value = 'ni';
  lateArea.dispatchEvent(
    new CompositionEvent('compositionupdate', { data: 'ni', bubbles: true })
  );
  lateArea.dispatchEvent(
    new CompositionEvent('compositionend', { data: 'ni', bubbles: true })
  );
  const lateEnter = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true
  });
  Object.defineProperty(lateEnter, 'keyCode', { value: 229 });
  lateArea.dispatchEvent(lateEnter);
  await t.sleep(200);
  check('an Enter after compositionend inserts no new line', await t.raw(), 'helloni\n');

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
