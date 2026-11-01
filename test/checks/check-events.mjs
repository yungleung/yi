/**
 * Says that the events the native menu sends are events the app knows.
 *
 * The menu lives in Rust and reaches the webview as Tauri events named by strings, so its half of
 * the app's event vocabulary cannot be checked by the compiler the way the frontend's half is: a
 * menu item renamed in `menu/events.rs` would simply stop arriving, and nothing would say so.
 * `src/services/events/contracts.ts` declares every name and its payload (the map the bus is typed by),
 * plus whether each event is local to one window or arrives from Rust. This check reads both sides
 * and fails when their vocabulary or transport boundary disagrees.
 *
 * It reads sources rather than bundling them — one side is Rust, the other is a type — which is the
 * same shape as `check-locales.mjs`, where two readers of one catalogue are held together.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const eventsFile = 'src/services/events/contracts.ts';
const rustDirectory = 'src-tauri/src';

const source = readFileSync(eventsFile, 'utf8');
const declared = new Set(
  source
    .slice(readFileSync(eventsFile, 'utf8').indexOf('export interface AppEvents'))
    .matchAll(/^\s{2}([a-z_]+)\??:/gm)
    .map((match) => match[1])
);

const failures = [];
const boundaryEntries = [
  ...source
    .slice(source.indexOf('export const EVENT_BOUNDARIES'))
    .matchAll(/^\s{2}([a-z_]+): '(local|inbound)'/gm)
].map((match) => [match[1], match[2]]);
const boundaries = new Map(boundaryEntries);
for (const name of declared) {
  if (!boundaries.has(name)) {
    failures.push(`${eventsFile} has no transport boundary for "${name}"`);
  }
}
for (const name of boundaries.keys()) {
  if (!declared.has(name)) {
    failures.push(`${eventsFile} declares a boundary for undeclared event "${name}"`);
  }
}
if (boundaryEntries.length !== boundaries.size) {
  failures.push(`${eventsFile} declares a transport boundary more than once`);
}
if (!declared.has('document_changed')) {
  failures.push(`${eventsFile} does not declare document_changed`);
}
if (declared.has('editor_edited') || declared.has('markdown_content_changed')) {
  failures.push(`${eventsFile} still declares one of the split document-change events`);
}
if (boundaries.get('document_changed') !== 'local') {
  failures.push(`${eventsFile} must mark document_changed local`);
}

const rustFiles = [];
const walkRust = (directory) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      walkRust(path);
    } else if (name.endsWith('.rs')) {
      rustFiles.push(path);
    }
  }
};
walkRust(rustDirectory);

for (const path of rustFiles) {
  const source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(/\.emit\(\s*"([a-z_]+)"/g)) {
    if (!declared.has(match[1])) {
      failures.push(
        `${path} emits "${match[1]}", which ${eventsFile} does not declare ` +
          'among its app events'
      );
    }
    if (boundaries.get(match[1]) !== 'inbound') {
      failures.push(
        `${path} emits "${match[1]}", which ${eventsFile} must mark inbound`
      );
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(
  `events: ${declared.size} names declared, ${boundaries.size} have one transport boundary, ` +
    'and every Rust emission is inbound'
);
