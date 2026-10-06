/**
 * Says that the events the native menu sends are events the app knows.
 *
 * The menu lives in Rust and reaches the webview as Tauri events named by strings, so its half of
 * the app's event vocabulary cannot be checked by the compiler the way the frontend's half is: a
 * menu item renamed in `menu.rs` would simply stop arriving, and nothing would say so.
 * `src/services/app_events.ts` declares every name and its payload (the map the bus is typed by);
 * this check reads the Rust side and fails on a name that map does not have.
 *
 * It reads sources rather than bundling them — one side is Rust, the other is a type — which is the
 * same shape as `check-locales.mjs`, where two readers of one catalogue are held together.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const eventsFile = 'src/services/app_events.ts';
const rustDirectory = 'src-tauri/src';

const declared = new Set(
  readFileSync(eventsFile, 'utf8')
    .slice(readFileSync(eventsFile, 'utf8').indexOf('export interface AppEvents'))
    .matchAll(/^\s{2}([a-z_]+)\??:/gm)
    .map((match) => match[1])
);

const failures = [];
for (const name of readdirSync(rustDirectory).filter((entry) => entry.endsWith('.rs'))) {
  const source = readFileSync(join(rustDirectory, name), 'utf8');
  for (const match of source.matchAll(/\.emit\(\s*"([a-z_]+)"/g)) {
    if (!declared.has(match[1])) {
      failures.push(
        `${rustDirectory}/${name} emits "${match[1]}", which ${eventsFile} does not declare ` +
          'among its app events'
      );
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`events: ${declared.size} names declared, and every one the menu sends is among them`);
