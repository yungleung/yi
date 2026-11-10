/**
 * Checks the editor context menu's command order, labels and enabled state.
 *
 * Example: a writable document with selected text enables Cut and Copy; a
 * read-only document keeps Copy but removes every formatting write.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({
  input: 'src/ui/editor_context_menu/model.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-editor-context-menu-'));
const file = join(directory, 'editor-context-menu.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { editorContextMenuModel } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
const item = (model, id) => model.find((node) => node.kind === 'item' && node.id === id) ?? null;
const commands = (model) =>
  model.filter((node) => node.kind === 'item').map((node) => node.command);

const writable = {
  readOnly: false,
  hasSelection: true,
  hasCaret: true,
  hasDocument: true,
  stacked: false
};
const model = editorContextMenuModel(writable);

check(
  'the menu presents clipboard, editing, insertion, list and session commands in order',
  commands(model),
  [
    'edit:cut',
    'edit:copy',
    'edit:paste',
    'edit:selectAll',
    'format:bold',
    'format:italic',
    'format:strikethrough',
    'format:inlineCode',
    'edit:insertLink',
    'edit:insertImage',
    'edit:insertFootnote',
    'table:choose',
    'list:ordered',
    'list:bullet',
    'list:task',
    'list:indent',
    'session:toggleStack',
    'session:openStack'
  ]
);
check(
  'the shortcut labels match the approved chords',
  [
    ['bold', 'CmdOrCtrl+B'],
    ['italic', 'CmdOrCtrl+I'],
    ['strike', 'CmdOrCtrl+Shift+X'],
    ['code', 'CmdOrCtrl+E'],
    ['link', 'CmdOrCtrl+K'],
    ['image', 'CmdOrCtrl+Shift+I'],
    ['footnote', 'CmdOrCtrl+Alt+F']
  ].map(([id, _]) => item(model, id)?.accelerator),
  [
    'CmdOrCtrl+B',
    'CmdOrCtrl+I',
    'CmdOrCtrl+Shift+X',
    'CmdOrCtrl+E',
    'CmdOrCtrl+K',
    'CmdOrCtrl+Shift+I',
    'CmdOrCtrl+Alt+F'
  ]
);
check(
  'a selected stack offers its removal',
  item(editorContextMenuModel({ ...writable, stacked: true }), 'session-toggle')?.labelKey,
  'session.pop'
);

const readOnly = editorContextMenuModel({ ...writable, readOnly: true });
for (const id of [
  'cut',
  'paste',
  'bold',
  'italic',
  'strike',
  'code',
  'link',
  'image',
  'footnote',
  'table',
  'ordered',
  'bullet',
  'task',
  'indent'
]) {
  check(`${id} is disabled in a read-only document`, item(readOnly, id)?.enabled, false);
}
for (const id of ['copy', 'select-all', 'session-toggle', 'session-open']) {
  check(`${id} remains available in a read-only document`, item(readOnly, id)?.enabled, true);
}

const caretOnly = editorContextMenuModel({ ...writable, hasSelection: false });
check('Cut needs selected text', item(caretOnly, 'cut')?.enabled, false);
check('Copy needs selected text', item(caretOnly, 'copy')?.enabled, false);
check('Paste only needs a caret', item(caretOnly, 'paste')?.enabled, true);
check('Formatting only needs a caret', item(caretOnly, 'bold')?.enabled, true);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('editor context menu: all checks passed');
