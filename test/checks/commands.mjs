/**
 * Says what a command is, and where it is allowed to live.
 *
 * One command has one name (a `namespace:name` id typed in
 * `src/commands/contracts.ts`), one place that registers it, and one
 * way to run it. Triggers — a key chord, a toolbar button, the table menu, the
 * native menu — resolve that name; they do not invent one, and they do not each
 * emit their own app-wide event.
 *
 * This check reads sources rather than bundling them: it is about where the code
 * is and what it may say.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const editorRoot = 'src/ui/markdown';
const commandRoot = 'src/commands';
const registry = `${commandRoot}/registry.ts`;
const runtime = `${commandRoot}/runtime.ts`;
const editor = `${editorRoot}/markdown_editor.ts`;
const menuBridge = `${commandRoot}/triggers/native_menu.ts`;
const keymap = `${commandRoot}/triggers/keymap.ts`;

/** Events that genuinely cross windows, so they stay on the Tauri bus. */
const crossWindowEvents = [
  'document_opened',
  'workspace_changed',
  'citation_updated',
  'citation_config_changed',
  'message',
  'document_changed'
];

const files = [];
(function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (path.endsWith('.ts')) {
      files.push(path);
    }
  }
})(editorRoot);

const failures = [];
const check = (name, condition) => {
  if (!condition) {
    failures.push(name);
  }
};

check(`${registry} exists`, statSync(registry, { throwIfNoEntry: false })?.isFile() === true);
const registrySource = statSync(registry, { throwIfNoEntry: false })?.isFile()
  ? readFileSync(registry, 'utf8')
  : '';
for (const symbol of ['registerCommand', 'registeredCommands']) {
  check(`${registry} exports ${symbol}`, new RegExp(`export function ${symbol}\\b`).test(registrySource));
}
check(
  `${registry} exports CommandRegistry`,
  /export class CommandRegistry\b/.test(registrySource)
);

check(`${runtime} exists`, statSync(runtime, { throwIfNoEntry: false })?.isFile() === true);
const runtimeSource = statSync(runtime, { throwIfNoEntry: false })?.isFile()
  ? readFileSync(runtime, 'utf8')
  : '';
for (const symbol of ['runCommand', 'dispatchCommand', 'dispatchRawCommand']) {
  check(`${runtime} exports ${symbol}`, new RegExp(`export function ${symbol}\\b`).test(runtimeSource));
}
check(
  `${runtime} exports commandDispatcher`,
  /export const commandDispatcher\b/.test(runtimeSource)
);

// One command, one name: no other module may declare a command of its own.
// The scan covers the whole UI, not just the editor: the producers that used to
// own these names live in src/ui/toolbar and src/ui/table, which is exactly where
// the first version of this check failed to look.
const uiFiles = [];
(function walkUi(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walkUi(path);
    } else if (path.endsWith('.ts')) {
      uiFiles.push(path);
    }
  }
})('src/ui');

for (const file of uiFiles) {
  const source = readFileSync(file, 'utf8');
  check(
    `${file} does not declare its own command event`,
    !/(?:^|\n)\s*export const [A-Z_]*COMMAND =/.test(source)
  );
  check(
    `${file} imports no retired command module`,
    !/from ['"][^'"]*ui\/markdown\/commands\/(?:registry|keymap|menu)['"]/.test(source)
  );
}

// The editor reaches commands by name through the registry, or through the menu
// bridge for the native menu — never by subscribing to a command event itself.
const editorSource = readFileSync(editor, 'utf8');
for (const match of editorSource.matchAll(/eventManager\.on\(\s*'([^']+)'/g)) {
  const event = match[1];
  check(
    `the editor's '${event}' listener is a cross-window event or comes from the menu bridge`,
    crossWindowEvents.includes(event) || /from '\.\/commands\/menu'/.test(editorSource)
  );
}

check(`${menuBridge} exists`, statSync(menuBridge, { throwIfNoEntry: false })?.isFile() === true);
check(`${keymap} exists`, statSync(keymap, { throwIfNoEntry: false })?.isFile() === true);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('commands: one name, one home, one way in');
