/**
 * Checks the edit algebra in Node: what an edit inverts to, how the log behaves at
 * its edges, and which keystrokes a run holds.
 *
 * The phase's point, as a property rather than a benchmark: a keystroke in a long
 * document must cost a few bytes of history, not two copies of the document — and a
 * run of typing is one step, with a letter as its boundary in any script.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/markdown/document/history.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-history-'));
const file = join(directory, 'history.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { History, invert, coalesceRun, trimRun } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const insert = (at, text) => ({ from: at, to: at, removed: '', inserted: text });
const replace = (from, to, removed, inserted) => ({ from, to, removed, inserted });

check('an insertion inverts to the deletion of what it inserted', invert(insert(3, 'ab')), {
  from: 3,
  to: 5,
  removed: 'ab',
  inserted: ''
});
check('a replacement inverts to itself, exchanged', invert(replace(2, 4, 'cd', 'xy')), {
  from: 2,
  to: 4,
  removed: 'xy',
  inserted: 'cd'
});
check('inverting twice is the edit again', invert(invert(replace(2, 4, 'cd', 'xy'))), replace(2, 4, 'cd', 'xy'));

const log = new History();
check('a fresh log has nothing to undo or redo', [log.canUndo(), log.canRedo(), log.length], [
  false,
  false,
  0
]);
log.record(insert(0, 'a'));
log.record(insert(1, 'b'));
check('recording moves the cursor to the end', [log.canUndo(), log.canRedo(), log.length], [
  true,
  false,
  2
]);
check('undo hands back the inverse of the last edit', log.undo(), invert(insert(1, 'b')));
check('and leaves redo available', [log.canUndo(), log.canRedo()], [true, true]);
check('redo hands back the edit itself', log.redo(), insert(1, 'b'));
check('redo at the end returns null', log.redo(), null);

log.undo();
log.record(insert(1, 'c'));
check('a new edit truncates the redo tail', [log.canRedo(), log.length], [false, 2]);
check('the log is the edits that are in force', log.edits(), [insert(0, 'a'), insert(1, 'c')]);
check('undo walks back through the log', [log.undo() !== null, log.undo() !== null], [true, true]);
check('undo at the start returns null', log.undo(), null);
check('and redo walks forward again', log.redo(), insert(0, 'a'));
log.clear();
check('clear empties both directions', [log.canUndo(), log.canRedo(), log.length], [false, false, 0]);

// The point of the phase: the history of a big document is small.
const typed = new History();
typed.record(insert(0, 'x'));
check('a one-character edit is a few bytes of history', JSON.stringify(typed.edits()).length < 60, true);

// The marks: an edit remembers where its author was, so undo can put them back there
// and redo can put them where the edit left off. A caret is a mark whose ends meet, so
// a selection is the same fact with two different ends — and it survives an undo.
const mark = (from, to = from) => ({ from, to });
const marked = { from: 4, to: 4, removed: '', inserted: 'x', before: mark(4), after: mark(5) };
check('an edit inverts with its marks exchanged', invert(marked), {
  from: 4,
  to: 5,
  removed: 'x',
  inserted: '',
  before: mark(5),
  after: mark(4)
});
check('and a selection stays a selection through the invert',
  invert({ from: 2, to: 4, removed: 'cd', inserted: 'xy', before: mark(2, 4), after: mark(4) }),
  { from: 2, to: 4, removed: 'xy', inserted: 'cd', before: mark(4), after: mark(2, 4) });
check('an edit without marks inverts without them', invert(insert(1, 'x')), {
  from: 1,
  to: 2,
  removed: 'x',
  inserted: ''
});
const careful = new History();
careful.record(marked, 'other');
check('undo hands back the mark the author left', careful.undo().after, mark(4));
check('and redo hands back the edit`s own', careful.redo().after, mark(5));

// The run: what one undo step holds. A letter extends it, the first character that
// is not a letter belongs to it and closes it, and the boundary is any script's.
const letter = (from, text, caretAt) => ({
  from,
  to: from,
  removed: '',
  inserted: text,
  before: mark(caretAt),
  after: mark(caretAt + text.length)
});
const closed = (edit) => ({ ...edit, to: edit.from + edit.inserted.length });
check('two letters in a row are one step', coalesceRun(letter(4, 'h', 4), letter(5, 'e', 5), 'typing'),
  letter(4, 'he', 4));
check('a space joins the word', coalesceRun(letter(4, 'he', 4), letter(6, ' ', 6), 'typing').inserted, 'he ');
check('and closes it, so the next letter starts a step',
  coalesceRun(closed(letter(4, 'he ', 4)), letter(7, 'w', 7), 'typing'), null);
check('a caret jump is not adjacent', coalesceRun(letter(4, 'h', 4), letter(20, 'e', 20), 'typing'), null);
check('another kind does not merge', coalesceRun(letter(4, 'h', 4), letter(5, 'e', 5), 'deleting'), null);
check('a letter that is not Latin merges too',
  coalesceRun(letter(0, '你', 0), letter(1, '好', 1), 'typing').inserted, '你好');
check('a CJK full stop closes the step',
  coalesceRun(closed(letter(0, '你好。', 0)), letter(3, '好', 3), 'typing'), null);
check('a paste is a step of its own',
  coalesceRun(letter(0, 'a', 0), { from: 1, to: 1, removed: '', inserted: 'word' }, 'typing'), null);
check('a committed input-method word is a step of its own',
  coalesceRun(letter(0, 'a', 0), { from: 1, to: 1, removed: '', inserted: 'word' }, 'commit'), null);
check('a run stops at the cap',
  coalesceRun(letter(0, 'x'.repeat(24), 0), letter(24, 'x', 24), 'typing'), null);
const erased = { from: 1, to: 2, removed: 'b', inserted: '', before: mark(2), after: mark(1) };
const erasedBefore = { from: 0, to: 1, removed: 'a', inserted: '', before: mark(1), after: mark(0) };
check('backspaces merge as deletions', coalesceRun(erased, erasedBefore, 'deleting'), {
  from: 0,
  to: 2,
  removed: 'ab',
  inserted: '',
  // The run starts where the first backspace was asked for and ends where the last
  // one left the caret.
  before: mark(2),
  after: mark(0)
});
const deletedForward = { from: 1, to: 2, removed: 'b', inserted: '', before: mark(1), after: mark(1) };
check('Delete merges forwards too',
  coalesceRun(deletedForward, { from: 1, to: 2, removed: 'c', inserted: '', before: mark(1), after: mark(1) }, 'deleting'),
  { from: 1, to: 3, removed: 'bc', inserted: '', before: mark(1), after: mark(1) });

// A Backspace that takes back the run's *own* last character is not a step of its own:
// it trims the run, so what the author typed and then part-deleted is one step, and a
// run deleted whole is no step at all.
const backspaceAt = (from, removed, caretAt) => ({
  from,
  to: from + removed.length,
  removed,
  inserted: '',
  before: mark(caretAt),
  after: mark(from)
});
check('a backspace at the run`s end trims it',
  trimRun(letter(4, 'hel', 4), backspaceAt(6, 'l', 7)),
  { from: 4, to: 4, removed: '', inserted: 'he', before: mark(4), after: mark(6) });
check('but a backspace that reaches past the run does not',
  trimRun(letter(4, 'x', 4), backspaceAt(3, 'e', 4)), null);
check('nor does a Delete, which removes forwards',
  trimRun(letter(4, 'x', 4), { from: 5, to: 6, removed: ' ', inserted: '', before: mark(5), after: mark(5) }),
  null);
check('nor one that removes a character the run did not write',
  trimRun(letter(4, 'x', 4), backspaceAt(4, 'y', 5)), null);
check('a run trimmed away leaves no step', (() => {
  const log = new History();
  log.record(letter(0, 'h', 0), 'typing');
  log.record(letter(1, 'e', 1), 'typing');
  log.record(backspaceAt(1, 'e', 2), 'deleting');
  log.record(backspaceAt(0, 'h', 1), 'deleting');
  return [log.length, log.canUndo(), log.canRedo()];
})(), [0, false, false]);
check('and a run that had replaced text keeps that deletion', (() => {
  const log = new History();
  log.record({ from: 2, to: 4, removed: 'cd', inserted: 'xy', before: mark(2, 4), after: mark(4) }, 'typing');
  log.record(backspaceAt(3, 'y', 4), 'deleting');
  log.record(backspaceAt(2, 'x', 3), 'deleting');
  return log.edits();
})(), [{ from: 2, to: 4, removed: 'cd', inserted: '', before: mark(2, 4), after: mark(2) }]);
check('and the letters after a trim join the same step', (() => {
  const log = new History();
  log.record(letter(4, 'h', 4), 'typing');
  log.record(letter(5, 'e', 5), 'typing');
  log.record(backspaceAt(5, 'e', 6), 'deleting');
  log.record(letter(5, 'y', 5), 'typing');
  return [log.length, log.edits()[0].inserted];
})(), [1, 'hy']);
check('a run of typing is one entry in the log', (() => {
  const step = new History();
  for (const [at, key] of [[0, 'h'], [1, 'e'], [2, 'l'], [3, 'l'], [4, 'o']]) {
    step.record(letter(at, key, at), 'typing');
  }
  return [step.length, step.edits()[0].inserted];
})(), [1, 'hello']);
check('a non-typing edit ends the run', (() => {
  const step = new History();
  step.record(letter(0, 'h', 0), 'typing');
  step.record({ from: 1, to: 1, removed: '', inserted: '\n' }, 'other');
  step.record(letter(2, 'e', 2), 'typing');
  return step.length;
})(), 3);

// The state records what it changed and undo applies the inverse — the same
// behaviour the whole-document pair had, with the log holding the edit itself.
globalThis.document = {
  addEventListener() {},
  createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {}, setAttribute() {} }),
  querySelectorAll: () => [],
  querySelector: () => null,
  createRange: () => ({})
};
globalThis.window = {
  getSelection: () => null,
  addEventListener() {},
  __TAURI_INTERNALS__: { transformCallback: () => 1, invoke: async () => null }
};

const stateBundle = await rolldown({ input: 'src/ui/markdown/document/state.ts', logLevel: 'silent' });
const { output: stateOutput } = await stateBundle.generate({ format: 'esm' });
await stateBundle.close();
const stateFile = join(directory, 'state.mjs');
writeFileSync(stateFile, stateOutput.find((chunk) => chunk.type === 'chunk').code);
const { MarkdownEditorState } = await import(stateFile);

const document_ = new MarkdownEditorState('one\ntwo\n');
document_.replaceRange(3, 3, 'X');
check('a range replacement changes the text', document_.getText(), 'oneX\ntwo\n');
check('and is one entry in the log', document_.historyEdits(), [
  { from: 3, to: 3, removed: '', inserted: 'X' }
]);
document_.undo();
check('undo puts the text back', document_.getText(), 'one\ntwo\n');
document_.redo();
check('redo applies it again', document_.getText(), 'oneX\ntwo\n');
document_.undo();
check('undoing past the first edit returns null', document_.undo(), null);
document_.replaceRange(0, 3, 'ONE');
check('a new edit truncates the redo tail', [document_.getText(), document_.historyEdits().length], [
  'ONE\ntwo\n',
  1
]);
check('and the log holds the edit, not the document', document_.historyEdits()[0].removed, 'one');
document_.loadText('fresh\n');
check('a new document has no history', [document_.historyEdits().length, document_.undo()], [0, null]);

// The mark reaches the log: the state records where the author was, and undoing the
// edit hands that mark back — a selection here, so the word the edit replaced can be
// typed over again rather than selected a second time.
document_.loadText('hello world\n');
document_.replaceRange(6, 11, 'there', {
  before: { from: 6, to: 11 },
  caret: 11
});
check('a replacement records the selection it replaced', document_.historyEdits(), [
  {
    from: 6,
    to: 11,
    removed: 'world',
    inserted: 'there',
    before: { from: 6, to: 11 },
    after: { from: 11, to: 11 }
  }
]);
check('and undoing it hands that selection back', document_.undo().after, { from: 6, to: 11 });
check('with the text the edit replaced', document_.getText(), 'hello world\n');

// A command that computes the whole document records the marks it was given — the two
// that do (inline formatting, find and replace all) know different things about where
// their author was, so an edit may carry both marks or only the one it started from.
document_.loadText('the old text\n');
document_.setText('the new text\n', { before: { from: 4, to: 7 }, after: { from: 4, to: 7 } });
check('a whole-document edit records the marks it was given', document_.historyEdits(), [
  {
    from: 0,
    to: 13,
    removed: 'the old text\n',
    inserted: 'the new text\n',
    before: { from: 4, to: 7 },
    after: { from: 4, to: 7 }
  }
]);
check('and undoing it hands the mark the command started from', document_.undo().after, { from: 4, to: 7 });
check('with the text it replaced', document_.getText(), 'the old text\n');

document_.loadText('one two three\n');
document_.setText('one Three\n', { before: { from: 4, to: 7 } });
check('a command with nowhere to leave the author records one mark', document_.historyEdits(), [
  { from: 0, to: 14, removed: 'one two three\n', inserted: 'one Three\n', before: { from: 4, to: 7 } }
]);
check('and its undo still gives that mark back', document_.undo().after, { from: 4, to: 7 });
check('and redoing it leaves no mark of its own', document_.redo().after, undefined);

// The state holds the text in a store rather than a string, so the statement to
// prove is the same one the store's own check makes: after any sequence of edits
// the state's text is the text a string ends up with. The sequence is pseudo-
// random and seeded, so a failure is reproducible, and it inserts the characters
// that change the shape of a document (newlines, markers, fences) rather than
// only letters.
let seed = 20260922;
const nextRandom = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const alphabet = ['a', 'b', ' ', '\n', '#', '`', '-', '\t'];
const randomText = (limit) => {
  const length = Math.floor(nextRandom() * limit);
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += alphabet[Math.floor(nextRandom() * alphabet.length)];
  }
  return text;
};

const random = new MarkdownEditorState('one\ntwo\n\nthree');
let reference = 'one\ntwo\n\nthree';
for (let step = 0; step < 100; step += 1) {
  const from = Math.floor(nextRandom() * (reference.length + 1));
  const to = Math.min(reference.length, from + Math.floor(nextRandom() * 4));
  const inserted = randomText(6);
  random.replaceRange(from, to, inserted);
  reference = `${reference.slice(0, from)}${inserted}${reference.slice(to)}`;
}
check('a hundred pseudo-random edits leave the state holding the string', random.getText(), reference);
check('and its blocks still agree with it', random.validateBlocks(), true);
check('each of those edits is one entry in the log', random.historyEdits().length, 100);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('history: all checks passed');
