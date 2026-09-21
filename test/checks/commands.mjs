/**
 * Says what a command is, and where it is allowed to live.
 *
 * One command has one name (a `namespace:name` id typed in
 * `src/ui/markdown/commands/registry.ts`), one place that registers it, and one
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
const registry = `${editorRoot}/commands/registry.ts`;
const editor = `${editorRoot}/markdown_editor.ts`;
const menuBridge = `${editorRoot}/commands/menu.ts`;

/** Events that genuinely cross windows, so they stay on the Tauri bus. */
const crossWindowEvents = [
  'document_opened',
  'workspace_changed',
  'citation_updated',
  'citation_config_changed',
  'toast',
  'markdown_content_changed'
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

check(`${registry} exists`, files.includes(registry));
const registrySource = files.includes(registry) ? readFileSync(registry, 'utf8') : '';
for (const symbol of ['registerCommand', 'runCommand', 'registeredCommands']) {
  check(`${registry} exports ${symbol}`, new RegExp(`export function ${symbol}\\b`).test(registrySource));
}

// One command, one name: no other module may declare a command of its own.
for (const file of files) {
  if (file === registry) {
    continue;
  }
  const source = readFileSync(file, 'utf8');
  check(
    `${file} does not declare its own command event`,
    !/(?:^|\n)\s*export const [A-Z_]*COMMAND =/.test(source)
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

check(`${menuBridge} exists`, files.includes(menuBridge));

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('commands: one name, one home, one way in');
