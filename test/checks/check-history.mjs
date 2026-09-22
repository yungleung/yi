/**
 * Checks the edit algebra in Node: what an edit inverts to, and how the log
 * behaves at its edges.
 *
 * The phase's point, as a property rather than a benchmark: a keystroke in a long
 * document must cost a few bytes of history, not two copies of the document.
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
const { History, invert } = await import(file);

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
check('undoing past the first edit returns false', document_.undo(), false);
document_.replaceRange(0, 3, 'ONE');
check('a new edit truncates the redo tail', [document_.getText(), document_.historyEdits().length], [
  'ONE\ntwo\n',
  1
]);
check('and the log holds the edit, not the document', document_.historyEdits()[0].removed, 'one');
document_.loadText('fresh\n');
check('a new document has no history', [document_.historyEdits().length, document_.undo()], [0, false]);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('history: all checks passed');
