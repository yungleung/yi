/**
 * A word being composed is written *into the line*, and the words after it move along.
 *
 * The marked text — pinyin, romaji on its way to kana, a hangul syllable — is what the
 * reader is typing, so it takes its place among the page's own characters: same type, same
 * scale, underlined, and the text after the caret is pushed right by it rather than covered.
 * It is not the document's text, though, and it never becomes any of it: the offsets mapping
 * steps over it (`data-composing`), the block is measured again because a longer word can
 * wrap the line, and the whole thing is taken out — with the text node it was cut out of
 * joined again — before the word commits.
 *
 * It is whatever the method has marked, so it knows nothing about any language; the second
 * family of methods, whose marked text arrives as an `input` of `insertCompositionText` with
 * no composition events behind it, is covered at the end.
 *
 * @covers src/ui/markdown/editing/composition_view.ts, src/ui/markdown/caret/offsets.ts: isComposing
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const seam = () => document.querySelector('.markdown-composition-input');
  const composing = () => document.querySelector('[data-composing]');
  const lineWidth = () => t.textNodesIn(t.blocks()[0])[0].parentElement.getBoundingClientRect().width;
  const marked = async (text) => {
    const area = seam();
    area.value = text;
    area.dispatchEvent(new CompositionEvent('compositionupdate', { data: text, bubbles: true }));
    await t.sleep(200);
  };

  await t.load('hello world\n');
  const before = lineWidth();
  // Halfway along the text, so there are words on both sides of the caret to watch.
  await t.click(t.textNodesIn(t.blocks()[0])[0].parentElement, 0.45, 0.5);
  await t.sleep(200);

  const area = seam();
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  await marked('nihao');
  const drawn = composing();
  const style = drawn ? getComputedStyle(drawn) : null;
  check('the marked text is written into the line', drawn?.textContent ?? null, 'nihao');
  check('in the page’s own type', style?.fontFamily ?? null, getComputedStyle(t.prose()).fontFamily);
  check('with the compose underline', style?.textDecorationLine ?? null, 'underline');
  check('and it is in the flow, not over it', style?.position ?? null, 'static');
  // The whole point: the words after the caret make room for it.
  const widened = lineWidth() - before;
  check('the words after the caret are pushed along', widened >= 20, true);
  // It is not the document's text, and nothing may read it as such.
  check('and the document is untouched by it', await t.raw(), 'hello world\n');

  // Cancelling the word (an Escape, an empty commit) takes the composing text out and leaves
  // the line exactly as it was: the node it was cut out of is joined again.
  area.value = '';
  area.dispatchEvent(new CompositionEvent('compositionend', { data: '', bubbles: true }));
  await t.sleep(200);
  check('a cancelled word is taken out', composing(), null);
  check('and the line is its own width again', Math.abs(lineWidth() - before) <= 1, true);
  check('with the document as it was', await t.raw(), 'hello world\n');

  // The word commits: the composing text goes and the word — never the pinyin — is written.
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  await marked('nihao');
  area.value = '你';
  area.dispatchEvent(new CompositionEvent('compositionend', { data: '你', bubbles: true }));
  await t.sleep(250);
  check('the composing text goes when the word commits', composing(), null);
  const after = await t.raw();
  check('with the word in the document, once', after.length, 'hello world\n'.length + 1);
  check('and the pinyin never lands in it', after.includes('nihao'), false);
  check('with nothing left in the page', t.prose().querySelectorAll('[data-composing]').length, 0);

  // The other family: marked text with no composition events behind it.
  const area2 = seam();
  area2.value = 'にほ';
  area2.dispatchEvent(
    new InputEvent('input', { data: 'にほ', inputType: 'insertCompositionText', bubbles: true })
  );
  await t.sleep(200);
  check('marked text with no composition events is written in too', composing()?.textContent ?? null, 'にほ');
  area2.value = '日本';
  area2.dispatchEvent(new InputEvent('input', { data: '日本', inputType: 'insertText', bubbles: true }));
  await t.sleep(250);
  check('and it goes when the word commits', composing(), null);
  check('with that word in the document', (await t.raw()).includes('日本'), true);

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
