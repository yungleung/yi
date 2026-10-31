/**
 * Checks a document's identity and revision series: commits advance once,
 * undo/redo are commits, and loading another document starts from zero.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-document-revision-'));
const build = await rolldown({
  input: 'src/ui/markdown/document/state.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await build.generate({ format: 'esm' });
await build.close();
const file = join(directory, 'state.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { MarkdownEditorState } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const state = new MarkdownEditorState('Alpha beta.\n');
check('a new state starts at revision zero', state.getRevision(), 0);
const firstKey = state.getDocumentKey();

state.replaceRange(0, 5, 'Gamma');
check('one edit advances one revision', state.getRevision(), 1);

state.undo();
check('undo advances the revision', state.getRevision(), 2);

state.redo();
check('redo advances the revision', state.getRevision(), 3);

state.setText('A replacement document.\n');
check('a whole-document command advances one revision', state.getRevision(), 4);

state.loadText('Another document.\n');
check('loading a document starts a new revision series', state.getRevision(), 0);
check('and creates a different document key', state.getDocumentKey() !== firstKey, true);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('document revision: identity and change sequence hold');
