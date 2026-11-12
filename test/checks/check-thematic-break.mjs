/**
 * Checks the thematic-break rule in Node: given the text and the caret, the
 * insertion is the `---` line with exactly the blank lines markdown needs
 * around it — kept when they are already there, added when they are not.
 *
 * The rule is a pure function of the raw text, so it is asserted here; the app
 * probe (`insert-rule.js`) covers the chord and the rendered rule.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

// The editing modules import the caret layer, which touches the DOM at import
// time; the rule under test never does.
globalThis.document = {
  addEventListener() {},
  createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {} }),
  querySelectorAll: () => [],
  querySelector: () => null,
  createRange: () => ({})
};
globalThis.window = {
  getSelection: () => null,
  addEventListener() {},
  __TAURI_INTERNALS__: {
    transformCallback: () => 1,
    invoke: async () => null
  }
};

const directory = mkdtempSync(join(tmpdir(), 'yi-thematic-break-'));
const bundle = await rolldown({ input: 'src/ui/markdown/editing/thematic_break.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'thematic_break.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { thematicBreakInsertion } = await import(pathToFileURL(file).href);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

/** The document after the insertion, which is what the reader ends up with. */
const applied = (text, offset) =>
  text.slice(0, offset) + thematicBreakInsertion(text, offset) + text.slice(offset);

check(
  'between two paragraphs the rule takes blank lines it does not have',
  applied('first line\n\nsecond line\n', 'first line'.length),
  'first line\n\n---\n\nsecond line\n'
);
check(
  'at the end of the document the rule still gets a line under it',
  applied('only line\n', 'only line'.length),
  'only line\n\n---\n\n'
);
check(
  'a paragraph line right above is separated, not underlined',
  applied('a\nb\n', 2),
  'a\n\n---\n\nb\n'
);
check(
  'a blank line above is kept rather than doubled',
  thematicBreakInsertion('a\n\nb\n', 3),
  '---\n\n'
);
// Nothing above the first line needs separating from: the same rule `Enter`
// follows at the start of a file (`paragraphStart` in `editing/blank_lines/paragraph.ts`),
// so a rule inserted there does not push two blank lines into the document.
check(
  'at the top of the document the rule needs no blank line above it',
  applied('b\n', 0),
  '---\n\nb\n'
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('thematic break: all checks passed');
