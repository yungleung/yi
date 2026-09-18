/**
 * Checks the footnote rules in Node: labels and numbering, where a marker and
 * its definition sit, the one edit the button makes, and — through the
 * markdown parser itself — that the borrowed definition text really does turn
 * `[^1]` into a footnote reference.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

const bundle = await rolldown({ input: 'src/ui/markdown/footnotes.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-footnotes-'));
const file = join(directory, 'footnotes.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { footnoteLabels, nextFootnoteNumber, footnoteOffsets, withFootnoteDefinitions, footnoteInsertEdit } =
  await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
const applied = (text, edit) =>
  text.slice(0, edit.from) + edit.replacement + text.slice(edit.to);
/** The node types of the first paragraph a parser produces. */
const inlineTypes = (markdown) => {
  const tree = unified().use(remarkParse).use(remarkGfm).runSync(
    unified().use(remarkParse).use(remarkGfm).parse(markdown)
  );
  return (tree.children[0].children ?? []).map((child) => child.type);
};

// Labels and numbering.
check('labels are read from definition lines', [...footnoteLabels('a[^1]\n\n[^1]: one\n\n[^note]: two\n')], ['1', 'note']);
check('a reference is not a definition', [...footnoteLabels('a[^1] and [^2]')], []);
check('the next number follows the highest one', nextFootnoteNumber('a[^1] b[^3]\n\n[^1]: x\n\n[^3]: y\n'), 4);
check('labelled footnotes do not number the next one', nextFootnoteNumber('a[^note]\n\n[^note]: x\n'), 1);
check('an empty document starts at 1', nextFootnoteNumber(''), 1);

// Offsets: where the jump lands.
const doc = 'Body text[^1] more.\n\n[^1]: The definition.\n';
const offsets = footnoteOffsets(doc, '1');
check('the reference offset', doc.slice(offsets.reference, offsets.referenceEnd), '[^1]');
check('the definition body offset starts at the note text', doc.slice(offsets.definitionBody), 'The definition.\n');
check('an unknown label has no offsets', footnoteOffsets(doc, '9'), {
  reference: null,
  referenceEnd: null,
  definitionBody: null
});
const emptyDefinition = 'x[^2]\n\n[^2]:';
check('an empty definition is found too',
  emptyDefinition.slice(footnoteOffsets(emptyDefinition, '2').definitionBody), '');

// The insertion: marker at the caret, definition at the end.
const inserted = footnoteInsertEdit(doc, 4, '2');
check('the marker goes at the caret and the definition on the next line at the end',
  applied(doc, inserted),
  'Body[^2] text[^1] more.\n\n[^1]: The definition.\n[^2]: ');
check('a document with no trailing newline gets one newline',
  applied('text', footnoteInsertEdit('text', 4, '1')),
  'text[^1]\n[^1]: ');
check('a document that already ends in a blank line keeps it',
  applied('text\n\n', footnoteInsertEdit('text\n\n', 4, '1')),
  'text[^1]\n\n[^1]: ');
check('an empty document gets a marker and a definition',
  applied('', footnoteInsertEdit('', 0, '1')),
  '[^1]\n[^1]: ');

// The borrowed definitions are what make the reference parse.
check('without its definition the reference is plain text',
  inlineTypes('text[^1] here.'), ['text']);
const borrowed = withFootnoteDefinitions('text[^1] here.', new Set(['1']));
check('the borrowed definition is appended', borrowed.startsWith('text[^1] here.'), true);
check('and then the reference parses',
  inlineTypes(borrowed), ['text', 'footnoteReference', 'text']);
check('a label the document does not define is left alone',
  withFootnoteDefinitions('text[^1] here.', new Set(['9'])), 'text[^1] here.');
check('a definition the block already has is not appended',
  withFootnoteDefinitions('text[^1]\n\n[^1]: x', new Set(['1'])), 'text[^1]\n\n[^1]: x');
check('a block with no references is untouched',
  withFootnoteDefinitions('plain text', new Set(['1'])), 'plain text');
check('the inserted marker parses as a reference beside the old one',
  inlineTypes(applied(doc, inserted)),
  ['text', 'footnoteReference', 'text', 'footnoteReference', 'text']);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('footnotes: all checks passed');
