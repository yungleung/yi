/**
 * Checks the block-slicing rules in Node, where a probe inside the app cannot
 * reach (the MCP bridge gives up after a few seconds and several document
 * swaps do not fit). It bundles the real `blocks.ts` and asserts the shapes
 * the plan's Task 2 requires:
 *
 * - one blank line between two blocks is a separator: no block;
 * - every further blank line becomes a `blank` block (an empty paragraph);
 * - leading and trailing runs carry no separator, so every blank line there is
 *   an empty paragraph, except the newline that only terminates the last line;
 * - a run that carries an empty paragraph ends a loose list.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/markdown/document/blocks.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-blocks-'));
const file = join(directory, 'blocks.mjs');
writeFileSync(file, output[0].code);
const { splitBlocks } = await import(file);

/** A compact shape of the sliced document: `kind@line` per block. */
const shape = (text) =>
  splitBlocks(text)
    .map((block) => `${block.kind}@${block.lineStart}`)
    .join(' ');

const cases = [
  ['one blank line is a separator', 'a\n\nb', 'paragraph@1 paragraph@3'],
  ['two blank lines add an empty paragraph', 'a\n\n\nb', 'paragraph@1 blank@3 paragraph@4'],
  [
    'three blank lines add two empty paragraphs',
    'a\n\n\n\nb',
    'paragraph@1 blank@3 blank@4 paragraph@5'
  ],
  ['a trailing blank line is an empty paragraph', 'a\n\n', 'paragraph@1 blank@2'],
  ['a single trailing newline is not a line', 'a\n', 'paragraph@1'],
  ['a leading run carries no separator', '\n\na', 'blank@1 blank@2 paragraph@3'],
  ['a normal loose list stays one block', '- a\n\n- b', 'paragraph@1'],
  [
    'a run with an empty paragraph ends the list',
    '- a\n\n\n- b',
    'paragraph@1 blank@3 paragraph@4'
  ]
];

let failures = 0;
for (const [name, markdown, expected] of cases) {
  const actual = shape(markdown);
  if (actual === expected) {
    console.log(`ok   ${name}`);
    continue;
  }
  failures += 1;
  console.log(`FAIL ${name}\n     expected: ${expected}\n     actual:   ${actual}`);
}

console.log(failures === 0 ? 'all block rules hold' : `${failures} rule(s) failed`);
process.exitCode = failures === 0 ? 0 : 1;
