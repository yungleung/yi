/**
 * The bracket pair in the editor's own key path: the `]` the app writes for the author, the `]`
 * it steps over, the `[[` that comes out as two pairs, the pair Backspace takes away whole, and
 * the places it writes nothing.
 *
 * The rules themselves are held in Node (`test/checks/check-brackets.mjs`); what is here is that
 * the keys reach them — the ordering of the pairing and the stepping over, the block the caret is
 * in deciding whether the text is prose, and the selection the author made.
 *
 * The citation and wikilink lists are `completion.js` and `completion-wikilink.js`.
 *
 * @covers src/ui/markdown/syntax/brackets.ts
 * @covers src/ui/markdown/editing/text_commands.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const same = (name, actual, expected) =>
    check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
  const caret = () => {
    const range = caretModule.getCaretRange();
    return range ? { text: range.startContainer.textContent, offset: range.startOffset } : null;
  };
  const body = () => t.textNodesIn(t.blocks()[0])[0];
  const place = async (text, offset) => {
    const range = document.createRange();
    range.setStart(text, offset);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    text.parentElement.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: rect.left + 1, clientY: rect.top + 2 })
    );
    await t.sleep(120);
  };
  const type = async (key) => {
    t.key(key);
    // The editor's deferred parse check runs at 200 ms. Let the brace's block settle
    // before the next key, so this probe measures bracket behavior rather than the
    // ordering of two timers.
    await t.sleep(240);
  };

  await t.load('abc\n');
  await place(body(), 1);
  await type('[');
  same('a bracket writes its pair, with the caret inside', [await t.raw(), caret()], [
    'a[]bc\n',
    { text: 'a[]bc', offset: 2 }
  ]);
  await type('[');
  same('and a second one makes two pairs with the caret between them', [await t.raw(), caret()], [
    'a[[]]bc\n',
    { text: 'a[[]]bc', offset: 3 }
  ]);
  await type(']');
  same('typing the bracket already there steps over it', [await t.raw(), caret()], [
    'a[[]]bc\n',
    { text: 'a[[]]bc', offset: 4 }
  ]);

  await t.load('abc\n');
  await place(body(), 1);
  await type('[');
  t.key('Backspace');
  await t.sleep(150);
  same('and Backspace takes an empty pair away whole', await t.raw(), 'abc\n');

  // A selection is an author about to type over their words: only the `[` they asked for is
  // written, with no `]` put after a selection nothing expects the end of.
  await t.load('abc\n');
  const words = body();
  const selected = document.createRange();
  selected.setStart(words, 1);
  selected.setEnd(words, 3);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(selected);
  await t.sleep(120);
  await type('[');
  same('and a bracket typed over a selection writes only itself', [await t.raw(), caret()], [
    'a[\n',
    { text: 'a[', offset: 2 }
  ]);

  await t.load('```\ncode\n```\n');
  // The click lands a pixel past the character boundary, so the caret sits inside the code's own
  // text — the place a pair written by a rule that does not know where it is would show up.
  await place(t.textNodesIn(t.blocks()[0])[0], 1);
  await type('[');
  same('no pair is written inside a fenced code block', await t.raw(), '```\nc[ode\n```\n');

  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
