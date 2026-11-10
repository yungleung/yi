/**
 * Says which probes may not run in the suite, and fails until the suite agrees.
 *
 * A probe that dispatches a `contextmenu` event opens this app's native table menu, and a
 * native menu blocks the webview until something closes it — which a scripted run cannot
 * do. So the next probe's calls wait seconds apiece and the run looks like a slow app
 * (measured: `bridge: 7 calls, median 8005.8 ms, 5 failed`). The harness already skips the
 * probes marked `@needs-foreground-window`; this check is what stops a new one from being
 * written without the marker, which is how `table-menu-open.js` came to cost the suite
 * eight seconds a call.
 *
 * It reads the probes' sources rather than running them: it is about what the files say,
 * the way `headers.mjs` is about what the modules say.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../probes/', import.meta.url));
/** A gesture the webview cannot undo: the menu stays open until a person closes it. */
const OPENS_A_MENU = /new MouseEvent\(\s*['"]contextmenu['"]/;
const MARKER = '@needs-foreground-window';
/** A probe that replaces the native presenter before dispatching the gesture. */
const INTERCEPTS_MENU = '@intercepts-menu';

const failures = [];
let marked = 0;
for (const name of readdirSync(directory).filter((entry) => entry.endsWith('.js'))) {
  const source = readFileSync(join(directory, name), 'utf8');
  if (!OPENS_A_MENU.test(source)) {
    continue;
  }
  if (source.includes(MARKER)) {
    marked += 1;
    continue;
  }
  if (source.includes(INTERCEPTS_MENU)) {
    continue;
  }
  failures.push(
    `${name} opens the native menu but has no ${MARKER} marker: the suite would run it ` +
      `and every probe after it would wait for a menu nobody can close; add ${MARKER} or ` +
      `replace the presenter and declare ${INTERCEPTS_MENU}`
  );
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`probe markers: ${marked} probes open a menu and say so`);
