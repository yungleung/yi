/**
 * A Backspace that takes back the characters a run of typing wrote.
 *
 * The run is the thing the author did, so the step it leaves is the text that survived
 * it: type "alpha", delete two letters, and *one* undo takes the three that are left —
 * not the two that were deleted first, with the run still to come. Type a word and
 * delete all of it and the burst is no step at all, which shows in what the next undo
 * takes: the edit before it, not an empty step that changes nothing.
 *
 * Two things the trim must not swallow: a Delete, which removes forwards into the
 * document's own text, and a character that the run did not write.
 *
 * @covers src/ui/markdown/document/history.ts, src/ui/markdown/document/state.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  /** Undo, the way the menu and the keymap ask for it. */
  const undo = async () => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'undo' });
    await t.sleep(250);
  };
  const type = async (text) => {
    for (const key of text) {
      t.key(key);
    }
    await t.sleep(250);
  };
  /** Puts the caret inside `needle`, `inside` characters in. */
  const caretAt = async (needle, inside) => {
    const block = t.blocks()[0];
    const node = t.textNodesIn(block).find((leaf) => leaf.data.includes(needle));
    const range = document.createRange();
    range.setStart(node, node.data.indexOf(needle) + inside);
    range.collapse(true);
    const box = range.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left,
        clientY: box.top + box.height / 2
      })
    );
    await t.sleep(150);
  };

  await t.load('one two\n');
  await caretAt('one', 3);
  await type('alpha');
  const typed = await t.raw();
  check('the letters reach the document', typed === 'onealpha two\n', typed);
  t.key('Backspace');
  t.key('Backspace');
  await t.sleep(250);
  const trimmed = await t.raw();
  check('the first two backspaces take two letters', trimmed === 'onealp two\n', trimmed);
  await undo();
  const undone = await t.raw();
  check('and one undo takes the three letters that survived them', undone === 'one two\n', undone);
  await undo();
  const twice = await t.raw();
  check('with nothing left of that burst', twice === 'one two\n', twice);

  // A run deleted whole changed nothing, so the next undo is the edit before it: the
  // line break, which puts the paragraph back together.
  await t.load('one two\n');
  await caretAt('one', 3);
  t.key('Enter');
  await t.sleep(250);
  const split = await t.raw();
  // The split leaves the paragraph's own space with the line the caret was in.
  check('the line break splits the paragraph', split === 'one\n\n two\n', split);
  await type('beta');
  for (let count = 0; count < 4; count += 1) {
    t.key('Backspace');
  }
  await t.sleep(250);
  const taken = await t.raw();
  check('and the word is gone again', taken === 'one\n\n two\n', taken);
  await undo();
  const joined = await t.raw();
  check('so one undo takes the line break, not an empty step', joined === 'one two\n', joined);

  // Delete removes forwards, into the text the run did not write: a step of its own.
  await t.load('one two\n');
  await caretAt('one', 3);
  await type('x');
  t.key('Delete');
  await t.sleep(250);
  const forward = await t.raw();
  check('Delete removes the character after the run', forward === 'onextwo\n', forward);
  await undo();
  const back = await t.raw();
  check('and undo gives that character back first', back === 'onex two\n', back);
  await undo();
  const run = await t.raw();
  check('with the run still to come', run === 'one two\n', run);

  // A letter typed after a trim joins the step it trimmed.
  await t.load('one two\n');
  await caretAt('one', 3);
  await type('he');
  t.key('Backspace');
  await t.sleep(250);
  const trimmedRun = await t.raw();
  check('a backspace trims the run', trimmedRun === 'oneh two\n', trimmedRun);
  await type('y');
  const joinedRun = await t.raw();
  check('and the letter after it joins the same run', joinedRun === 'onehy two\n', joinedRun);
  await undo();
  const whole = await t.raw();
  check('so one undo takes the whole step', whole === 'one two\n', whole);
  await undo();
  const none = await t.raw();
  check('and there is nothing more of it', none === 'one two\n', none);

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
