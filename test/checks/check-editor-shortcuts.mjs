/**
 * Checks the editor's formatting and insertion shortcuts.
 *
 * Example: `Cmd+B` requests Bold while `Cmd+Shift+B` requests nothing.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({
  input: 'src/commands/triggers/keymap.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-editor-shortcuts-'));
const file = join(directory, 'keymap.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { commandForKey } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
const chord = (key, modifiers = {}) => ({
  key,
  code: `Key${key.toUpperCase()}`,
  metaKey: true,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers
});

for (const [key, modifiers, command] of [
  ['b', {}, 'format:bold'],
  ['i', {}, 'format:italic'],
  ['x', { shiftKey: true }, 'format:strikethrough'],
  ['e', {}, 'format:inlineCode'],
  ['k', {}, 'edit:insertLink'],
  ['i', { shiftKey: true }, 'edit:insertImage'],
  ['f', { altKey: true }, 'edit:insertFootnote']
]) {
  check(`${key} with ${JSON.stringify(modifiers)}`, commandForKey(chord(key, modifiers)), command);
}
check('Ctrl uses the same chords', commandForKey({
  ...chord('b'),
  metaKey: false,
  ctrlKey: true
}), 'format:bold');
check(
  'Option uses the physical letter even when it changes the typed character',
  commandForKey({ ...chord('f', { altKey: true }), key: 'ƒ' }),
  'edit:insertFootnote'
);
check('a shifted bold chord is not bold', commandForKey(chord('b', { shiftKey: true })), null);
check('an unrelated chord remains unbound', commandForKey(chord('j')), null);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('editor shortcuts: all checks passed');
