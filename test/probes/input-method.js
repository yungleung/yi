/**
 * Typing through an input method: the editor hands the keyboard to a seam the system
 * can compose into, and what commits lands in the document as one word.
 *
 * A `keydown` path can only ever see one character per key, so the system has nowhere
 * to compose a Chinese, Japanese or Korean word — and dictation and the emoji panel
 * have nowhere to arrive. The seam is an invisible textarea that holds the keyboard
 * while the caret is in the editor; this probe checks what a browser can see of it:
 * an editable element has the focus, it sits where the caret is, and the keys the
 * editor handles never reach it.
 *
 * @covers src/ui/markdown/editing/composition_input.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const seam = () => document.querySelector('.markdown-composition-input');

  await t.load('hello world\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);

  check('the seam is a textarea', seam()?.tagName ?? null, 'TEXTAREA');
  check('and it holds the keyboard', document.activeElement === seam(), true);

  // The system composes only into a field it can see, and this is what "can see" turned out
  // to mean (measured with its own keystrokes; `styles.css` has the whole story): an opaque
  // field, a real box, and *no ink* — a hair-thin box or `opacity: 0` gets no composition,
  // so this is the shape a future tidy-up must not change back.
  const seamStyle = getComputedStyle(seam());
  check('the seam is opaque enough for the system to compose into it', seamStyle.opacity, '1');
  check(
    'but nothing of it is drawn over the page',
    seamStyle.color === 'rgba(0, 0, 0, 0)' && seamStyle.backgroundColor === 'rgba(0, 0, 0, 0)',
    true
  );
  check('and it is a real box, not a hair-thin one', parseFloat(seamStyle.width) > 10, true);

  const caret = t.caretRect();
  const box = seam()?.getBoundingClientRect() ?? null;
  check('it sits on the caret’s own line',
    caret !== null && box !== null && Math.abs(box.top - caret.y) <= 6,
    true);

  t.key('x');
  t.key('y');
  await t.sleep(250);
  check('the editor still takes the keys', await t.raw(), 'hello worldxy\n');
  check('and the seam stays empty', seam()?.value ?? null, '');

  // A Chinese word, the way the system delivers one: the value is set as it is chosen,
  // then committed. (A dispatched CompositionEvent carries no text of its own, so the
  // probe writes the value the browser would have.)
  const area = seam();
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  area.value = 'ni';
  area.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'ni', bubbles: true }));
  area.value = '你';
  area.dispatchEvent(new CompositionEvent('compositionend', { data: '你', bubbles: true }));
  await t.sleep(250);
  check('the committed word lands at the caret', await t.raw(), 'hello worldxy你\n');
  check('and the seam gives its text up', area.value, '');

  // One undo takes the word, and only the word: the commit is a step of its own.
  await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'undo' });
  await t.sleep(300);
  check('one undo takes the committed word back', await t.raw(), 'hello worldxy\n');

  // Dictation and the emoji panel arrive as an `input` with no composition at all.
  area.value = '好';
  area.dispatchEvent(new InputEvent('input', { data: '好', inputType: 'insertText', bubbles: true }));
  await t.sleep(250);
  check('a dictated word lands the same way', await t.raw(), 'hello worldxy好\n');

  // The key that chose the word — a space — comes once more as ordinary text, right after the
  // commit. It is the input method's key, not the author's text, so the document must not grow
  // a space after every word.
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  area.value = '你';
  area.dispatchEvent(new CompositionEvent('compositionend', { data: '你', bubbles: true }));
  area.value = ' ';
  area.dispatchEvent(new InputEvent('input', { data: ' ', inputType: 'insertText', bubbles: true }));
  await t.sleep(250);
  check('the space that chose the word is not typed into it', await t.raw(), 'hello worldxy好你\n');
  check('and the seam keeps nothing of it', area.value, '');

  // An input method that sends its marked text without composition events must not have it
  // typed into the document, character by character.
  area.value = 'ni';
  area.dispatchEvent(
    new InputEvent('input', { data: 'ni', inputType: 'insertCompositionText', bubbles: true })
  );
  await t.sleep(250);
  check('marked text with no composition is left alone', await t.raw(), 'hello worldxy好你\n');

  // The last key of a composition — the one that picks the candidate — reaches the editor with
  // the composition already over, marked only by `keyCode` 229, and the editor must leave it to
  // the input method: typing it writes a space after every Chinese word, and (being an edit
  // inside the method's own key handling) is what stopped the next word from composing.
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  area.value = '字';
  area.dispatchEvent(new CompositionEvent('compositionend', { data: '字', bubbles: true }));
  const imeKey = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
  Object.defineProperty(imeKey, 'keyCode', { value: 229 });
  t.scroller().dispatchEvent(imeKey);
  await t.sleep(250);
  check(
    'the key that picked the candidate is the input method’s',
    await t.raw(),
    'hello worldxy好你字\n'
  );
  check('and the editor did not swallow it', imeKey.defaultPrevented, false);

  // Committing costs the field its input context — the next word would never compose — so the
  // seam takes the keyboard back once the turn is over, which a focus event says it did.
  let focusedAgain = false;
  area.addEventListener('focus', () => {
    focusedAgain = true;
  });
  area.value = '字';
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  area.dispatchEvent(new CompositionEvent('compositionend', { data: '字', bubbles: true }));
  await t.sleep(250);
  for (let attempt = 0; attempt < 20 && !focusedAgain; attempt += 1) {
    await t.sleep(50);
  }
  check('the field takes the keyboard back after a commit', focusedAgain, true);
  check('and the seam has the keyboard', document.activeElement === area, true);

  // A pointer that is down is the reader's: dragging over text selects it, and taking the
  // keyboard out from under the drag is what cancels the selection. When the gesture is
  // over, the editor takes the keyboard back as it always did.
  const scroller = t.scroller();
  scroller.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  scroller.focus();
  await t.sleep(150);
  check('a drag in progress keeps the reader’s own keyboard', document.activeElement, scroller);
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  scroller.blur();
  scroller.focus();
  await t.sleep(150);
  check('and the editor takes it back once the gesture is over', document.activeElement, area);

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
