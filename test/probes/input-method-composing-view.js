/**
 * A word being composed is drawn where the reader is writing it: the marked text —
 * pinyin, romaji on its way to kana, a hangul syllable — in the page's own type with
 * the compose underline, at the caret, until the word commits.
 *
 * It is what the input method has marked so far, whatever that is: the view mirrors
 * the seam's value, so it says nothing about Chinese, or about any language. Two
 * families of method are covered — the one that sends `compositionupdate`, and the one
 * whose marked text arrives as an `input` of `insertCompositionText` with no composition
 * events behind it.
 *
 * @covers src/ui/markdown/editing/composition_view.ts, src/ui/markdown/editing/composition_input.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const seam = () => document.querySelector('.markdown-composition-input');
  /** The composing text as the reader sees it, or null when nothing is drawn. */
  const drawn = () => {
    const view = document.querySelector('.markdown-composition-view');
    return view !== null && getComputedStyle(view).display !== 'none' ? view : null;
  };
  const caretBar = () => document.querySelector('.markdown-caret');

  await t.load('hello\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);

  // A composition the way the system delivers one: the value is set as it is marked,
  // then a composition event says so. (A dispatched CompositionEvent carries no text
  // of its own, so the probe writes the value the browser would have.)
  const area = seam();
  const blockBefore = t.rectOf(t.blocks()[0]);
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  area.value = 'ni';
  area.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'ni', bubbles: true }));
  await t.sleep(180);
  const view = drawn();
  const viewStyle = view ? getComputedStyle(view) : null;
  check('the marked text is drawn', view?.textContent ?? null, 'ni');
  check('and it is the page’s own type', viewStyle?.fontFamily ?? null, getComputedStyle(t.prose()).fontFamily);
  check('with the compose underline', viewStyle?.textDecorationLine ?? null, 'underline');
  const caret = t.caretRect();
  const box = view?.getBoundingClientRect() ?? null;
  check(
    'drawn where the caret is',
    caret !== null && box !== null && Math.abs(box.left - caret.x) <= 8 && Math.abs(box.top - caret.y) <= 8,
    true
  );
  check('and the blinking bar gives it the space', caretBar() ? getComputedStyle(caretBar()).visibility : null, 'hidden');

  // It must sit *on* the line, not near it: the ink box of the composing text lines up
  // with the ink box of the words already written there. (Measured: exactly equal.)
  const ink = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  };
  const line = ink(t.textNodesIn(t.blocks()[0])[0]);
  const drawnInk = ink(view);
  check(
    'and it sits on the line it is written on',
    Math.abs(drawnInk.top - line.top) <= 1 && Math.abs(drawnInk.bottom - line.bottom) <= 1,
    true
  );
  // The overlay is the price of that: nothing reflows while a word is being chosen, so
  // the page the reader is looking at stays where it was.
  check('the page does not move under it', t.rectOf(t.blocks()[0]), blockBefore);

  // The word commits: the composing text goes, the word stays.
  area.value = '你';
  area.dispatchEvent(new CompositionEvent('compositionend', { data: '你', bubbles: true }));
  await t.sleep(250);
  check('the composing text goes when the word commits', drawn(), null);
  check('and the caret comes back', caretBar() ? getComputedStyle(caretBar()).visibility : null, 'visible');
  check('with the word in the document', await t.raw(), 'hello你\n');

  // The other family: marked text with no composition events behind it, which is how
  // some methods send kana and hangul.
  const area2 = seam();
  area2.value = 'にほ';
  area2.dispatchEvent(
    new InputEvent('input', { data: 'にほ', inputType: 'insertCompositionText', bubbles: true })
  );
  await t.sleep(180);
  check('marked text with no composition events is drawn too', drawn()?.textContent ?? null, 'にほ');
  area2.value = '日本';
  area2.dispatchEvent(new InputEvent('input', { data: '日本', inputType: 'insertText', bubbles: true }));
  await t.sleep(250);
  check('and it goes when the word commits', drawn(), null);
  check('with that word in the document', await t.raw(), 'hello你日本\n');

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
