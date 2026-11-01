/**
 * The Backspace that edits the marked word is the input method's, not the editor's.
 *
 * While a word is being composed, Backspace takes a letter off *it*; the key that takes the
 * last one empties the word, and it reaches the editor with the composition already over and
 * nothing on the event to say so. Read as the editor's, it deletes the character before the
 * caret in the *document*: measured by the reader, `你好` with `zhongguo` being composed lost
 * 好 with the last letter — and the same inside an English word, which is the same event with
 * a different word around it. A Backspace of the reader's own, away from any composition, must
 * still delete.
 *
 * @covers src/ui/markdown/editing/composition/input.ts: markedText, src/ui/markdown/markdown_editor.ts: handleKeydown
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const seam = () => document.querySelector('.markdown-composition-input');
  const mark = async (text) => {
    const area = seam();
    area.value = text;
    area.dispatchEvent(new CompositionEvent('compositionupdate', { data: text, bubbles: true }));
    await t.sleep(150);
  };

  await t.load('你好\n');
  await t.click(t.blocks()[0], 0.99, 0.5);
  await t.sleep(200);

  // A letter is being composed, and Backspace takes one off it.
  const area = seam();
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  await mark('zhongguo');
  t.key('Backspace');
  await t.sleep(250);
  check('a Backspace inside the word does not touch the document', await t.raw(), '你好\n');

  // …and the one that empties the word arrives with the composition already over.
  area.value = '';
  area.dispatchEvent(new CompositionEvent('compositionend', { data: '', bubbles: true }));
  t.key('Backspace');
  await t.sleep(250);
  check('and neither does the one that emptied it', await t.raw(), '你好\n');
  check('with nothing left in the page', t.prose().querySelectorAll('[data-composing]').length, 0);

  // The reader's own Backspace, with no word in flight, still deletes.
  await t.sleep(200);
  t.key('Backspace');
  await t.sleep(250);
  check('a Backspace of the reader’s own still deletes', await t.raw(), '你\n');

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
