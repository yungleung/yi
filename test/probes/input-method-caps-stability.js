/**
 * A Chinese input method with Caps Lock on must not leak upper-case pass-through letters.
 *
 * Example: the method routes `A` with key code 229 and then supplies `A` to the native seam.
 * The document must receive `a`, including when a previous clear timer or a late
 * composition boundary lands between those two events. An ordinary English Caps Lock
 * keydown, which is not routed through the method, still writes `A`.
 *
 * @covers src/ui/markdown/editing/composition/input.ts
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
  const routed = (key, keyCode = 229) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(event, 'keyCode', { value: keyCode });
    t.scroller().dispatchEvent(event);
  };
  const ordinaryCaps = (key, keyCode) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(event, 'keyCode', { value: keyCode });
    Object.defineProperty(event, 'getModifierState', {
      value: (modifier) => modifier === 'CapsLock'
    });
    t.scroller().dispatchEvent(event);
  };
  const nativeInput = (text, inputType = 'insertText') => {
    seam().value = text;
    seam().dispatchEvent(
      new InputEvent('input', {
        data: text,
        inputType,
        bubbles: true
      })
    );
  };
  const start = async () => {
    await t.load('hello\n');
    await t.click(t.blocks()[0], 0.99, 0.5);
    await t.sleep(200);
    seam().value = '';
    seam().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    await t.sleep(60);
  };

  await start();
  routed('A');
  await t.sleep(60);
  nativeInput('A');
  await t.sleep(120);
  check('a delayed routed letter is lower-case', await t.raw(), 'helloa\n');

  // The previous input scheduled a zero-delay clear. The next routed key arrives
  // before that timer, and the timer must not erase the new key's method marker.
  await start();
  routed('A');
  nativeInput('A');
  routed('B');
  await t.sleep(20);
  nativeInput('B');
  await t.sleep(120);
  check('an older clear timer cannot upper-case the next letter', await t.raw(), 'helloab\n');

  // Some macOS input-source transitions announce composition immediately after the
  // routed keydown. That boundary describes the method, not a different owner for
  // the letter already handed to the seam.
  await start();
  routed('C');
  seam().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  nativeInput('C', 'insertCompositionText');
  seam().dispatchEvent(
    new CompositionEvent('compositionend', { data: 'C', bubbles: true })
  );
  await t.sleep(120);
  check('a late composition start keeps the routed letter lower-case', await t.raw(), 'helloc\n');

  // The English source must retain the opposite behaviour: Caps Lock there is an
  // ordinary editor key and its upper-case character is intentional.
  await start();
  ordinaryCaps('D', 68);
  await t.sleep(120);
  check('an ordinary English Caps Lock key stays upper-case', await t.raw(), 'helloD\n');

  // Repeat the interleaving as one burst, which is the shape that exposed the
  // intermittent report: several routed keys and native inputs share one timer.
  await start();
  for (const [index, key] of [...'ABCDEFGHIJ'].entries()) {
    routed(key);
    if (index > 0) {
      await t.sleep(index % 3);
    }
    nativeInput(key);
  }
  await t.sleep(150);
  check('a mixed routed burst stays lower-case', await t.raw(), 'helloabcdefghij\n');

  // At speed, several keydowns can arrive before the browser hands their native
  // inputs back one at a time. Committing the first letter must consume only its
  // own marker, leaving the later letters' ownership waiting.
  await start();
  routed('A');
  routed('B');
  routed('C');
  nativeInput('A');
  nativeInput('B');
  nativeInput('C');
  await t.sleep(150);
  check('native inputs may trail several routed keydowns', await t.raw(), 'helloabc\n');

  // Repeat the backlog under a longer burst, so a marker cannot survive by falling
  // inside only one hand-written interleaving.
  await start();
  for (let round = 0; round < 4; round += 1) {
    const letters = [...'ABCDEFGHIJ'];
    for (const letter of letters) {
      routed(letter);
    }
    for (const letter of letters) {
      nativeInput(letter);
    }
  }
  await t.sleep(150);
  check(
    'a long ultra-fast routed burst stays lower-case',
    await t.raw(),
    `hello${'abcdefghij'.repeat(4)}\n`
  );

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
