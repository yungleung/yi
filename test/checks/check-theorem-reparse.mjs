/**
 * Checks that theorem declarations are a parse dependency of fenced Div
 * blocks.
 *
 * Example: typing `Claim` into `amsthm.plain` changes an existing `.Claim` Div
 * from exact source to a theorem, and removing the declaration changes it back
 * without altering either source text.
 *
 * May import: the bundled document state under test. Upholds: the check reads
 * the actual block cache rather than calling the parser a second time.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-theorem-reparse-'));
const bundle = await rolldown({
  input: 'src/ui/markdown/document/state.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'state.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { MarkdownEditorState } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
const theoremCount = (state) => {
  const block = state.getBlocks().find((candidate) => candidate.text.includes('.Claim'));
  if (block === undefined) return null;
  return state.getBlockContent(block).filter((node) => node.type === 'theorem').length;
};
const withClaim = [
  '---',
  'amsthm:',
  '  plain:',
  '    - Claim',
  '---',
  '',
  '::: {.Claim}',
  'Body.',
  ':::'
].join('\n');

const state = new MarkdownEditorState('::: {.Claim}\nBody.\n:::');
check('an undeclared Claim is exact source', theoremCount(state), 0);
const firstKey = state.parseKey(state.getBlocks()[0]);
state.setText(withClaim);
check('adding the declaration reparses the Div as a theorem', theoremCount(state), 1);
check(
  'the Div parse key changes with the vocabulary',
  state.parseKey(state.getBlocks().find((block) => block.text.includes('.Claim'))) !== firstKey,
  true
);

state.setText('::: {.Claim}\nBody.\n:::');
check('removing the declaration returns exact source', theoremCount(state), 0);
check(
  'and the source bytes are unchanged',
  state.getText(),
  '::: {.Claim}\nBody.\n:::'
);

if (failures.length > 0) {
  console.error(failures.join('\n\n'));
  process.exit(1);
}

console.log('theorem reparse: declaration changes invalidate Div parses');
