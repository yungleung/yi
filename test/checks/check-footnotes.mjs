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

const bundle = await rolldown({ input: 'src/ui/markdown/syntax/footnote/index.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-footnotes-'));
const file = join(directory, 'footnotes.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const {
  footnoteLabels,
  labelsAfterEdit,
  nextFootnoteNumber,
  footnoteOffsets,
  withFootnoteDefinitions,
  footnoteInsertEdit
} = await import(file);

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

// A definition written inside a container defines its label for the whole
// document — the block-by-block parse borrows it across blocks by this shape, so
// a `>` or a list marker in front of it may not hide it.
check('a definition inside a blockquote is read',
  [...footnoteLabels('Body[^1] here.\n\n> [^1]: the note in the quote\n')], ['1']);
check('and so is one behind two containers',
  [...footnoteLabels('Body[^1] here.\n\n> - item\n>\n>   [^1]: the note\n')], ['1']);
check('an indented code block is not a definition',
  [...footnoteLabels('Body[^x] here.\n\n    [^x]: a code block, not a note\n')], []);
check('a definition the line opens as an item is read',
  [...footnoteLabels('Body[^1] here.\n\n- [^1]: the note\n')], ['1']);
// The line rule describes the definition's own line, not markdown's containers:
// four spaces in, a definition and an indented code block look the same, and the
// code block's reading is the one kept. `docs/roadmap.md` holds this as a residue.
check('a definition indented inside a wide item is left as the text it is',
  [...footnoteLabels('Body[^1] here.\n\n10. item\n\n    [^1]: the note\n')], []);

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
// Markdown labels are not case-sensitive, and the normalised one is what a marker
// carries, so a label written `[^Note]` has to be found from `[^note]`.
const mixedCase = 'Body[^Note] here.\n\n[^Note]: The definition.\n';
const mixed = footnoteOffsets(mixedCase, 'note');
check('a label is matched however it is cased',
  [mixedCase.slice(mixed.reference, mixed.referenceEnd), mixedCase.slice(mixed.definitionBody)],
  ['[^Note]', 'The definition.\n']);
// A definition inside a container: the jump target is the note's own text, not
// the container's marker — the body offset is measured after `]: ` wherever the
// definition line sits.
const inQuote = 'Body[^1] here.\n\n> [^1]: The definition.\n';
const quoted = footnoteOffsets(inQuote, '1');
check('a definition inside a blockquote is found for the jump',
  inQuote.slice(quoted.definitionBody), 'The definition.\n');
check('and its reference is the marker in the text',
  inQuote.slice(quoted.reference, quoted.referenceEnd), '[^1]');
const inItem = 'Body[^1] here.\n\n10. item\n\n    [^1]: The definition.\n';
// The same residue as above, from the jump's side: a definition four columns into
// a wide item is not found, so the marker's jump has nowhere to go.
check('a definition indented inside a wide item has no jump target',
  footnoteOffsets(inItem, '1').definitionBody, null);
const inItemBeside = 'Body[^1] here.\n\n- [^1]: The definition.\n';
check('and one the line opens as an item does',
  inItemBeside.slice(footnoteOffsets(inItemBeside, '1').definitionBody), 'The definition.\n');

// The insertion: marker at the caret, definition at the end.
const inserted = footnoteInsertEdit(doc, 4, '2');
check('the marker goes at the caret and the definition joins the notes at the end',
  applied(doc, inserted),
  'Body[^2] text[^1] more.\n\n[^1]: The definition.\n[^2]: \n');
check('a document with no trailing newline gains the blank line',
  applied('text', footnoteInsertEdit('text', 4, '1')),
  'text[^1]\n\n[^1]: \n');
check('a document that already ends in a blank line keeps it',
  applied('text\n\n', footnoteInsertEdit('text\n\n', 4, '1')),
  'text[^1]\n\n[^1]: \n');
check('an empty document gets a marker and a definition',
  applied('', footnoteInsertEdit('', 0, '1')),
  '[^1]\n\n[^1]: \n');
check('a second footnote joins the notes without a blank line',
  applied('Body[^1].\n\n[^1]: First.\n', footnoteInsertEdit('Body[^1].\n\n[^1]: First.\n', 4, '2')),
  'Body[^2][^1].\n\n[^1]: First.\n[^2]: \n');
check('a second footnote joins a note written without a trailing newline',
  applied('Body[^1].\n\n[^1]: First.', footnoteInsertEdit('Body[^1].\n\n[^1]: First.', 4, '2')),
  'Body[^2][^1].\n\n[^1]: First.\n[^2]: \n');
check('a note with an indented continuation still counts as the notes',
  applied('Body[^1].\n\n[^1]: First.\n    continued\n',
    footnoteInsertEdit('Body[^1].\n\n[^1]: First.\n    continued\n', 4, '2')),
  'Body[^2][^1].\n\n[^1]: First.\n    continued\n[^2]: \n');
check('text below the notes starts them again with a blank line',
  applied('Body[^1].\n\n[^1]: First.\n\nA closing paragraph.\n',
    footnoteInsertEdit('Body[^1].\n\n[^1]: First.\n\nA closing paragraph.\n', 4, '2')),
  'Body[^2][^1].\n\n[^1]: First.\n\nA closing paragraph.\n\n[^2]: \n');
check('the document still ends with a line ending',
  applied(doc, inserted).endsWith('\n'), true);
check('and so does one written into a document with no trailing newline',
  applied('text', footnoteInsertEdit('text', 4, '1')).endsWith('\n'), true);

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

/**
 * Applies a sequence of edits, folding the labels in the way the state does —
 * `labelsAfterEdit` against the text each edit produced — and reports the labels
 * that walk ends with and the edits it made.
 */
const folded = (markdown, edits) => {
  let text = markdown;
  let labels = footnoteLabels(text);
  const applied_ = [];
  for (const [from, to, inserted] of edits) {
    const edit = { from, to, removed: text.slice(from, to), inserted };
    text = `${text.slice(0, from)}${inserted}${text.slice(to)}`;
    labels = labelsAfterEdit(labels, text, edit);
    applied_.push({ edit, labels: [...labels], scan: [...footnoteLabels(text)] });
  }
  return { text, labels: [...labels], scan: [...footnoteLabels(text)], applied: applied_ };
};

// The labels an edit leaves behind are the labels of the text it produced. The
// rule may fall back to a scan whenever it is unsure; what it may not do is come
// back one label short, which is a reference that stops parsing as a footnote.
const cases = [
  ['a definition typed into a document', 'Body[^1].\n', [[9, 9, '\n\n[^1]: note\n']]],
  ['a label renamed', '[^1]: one\n\nBody[^1].\n', [[2, 3, '2'], [17, 18, '2']]],
  ['a definition line deleted', '[^1]: one\n\nBody.\n', [[0, 10, '']]],
  ['two lines joined, swallowing a definition', 'text\n[^1]: note\n', [[4, 5, '']]],
  ['a line split, opening a definition', 'text[^1]: note\n', [[4, 4, '\n']]],
  [
    'a definition written in front of a character',
    'note[^1]\n\n[^1]: the note\n',
    [[14, 14, 'x']]
  ],
  ['the text of a definition typed in', '[^1]: note\n', [[8, 8, 'x'], [9, 9, 'y']]],
  ['a paragraph rewritten around a definition', 'para\n\n[^1]: note\n\nmore\n', [[0, 4, 'text']]]
];
for (const [name, markdown, edits] of cases) {
  const result = folded(markdown, edits);
  const wrong = result.applied.find((step) => JSON.stringify(step.labels) !== JSON.stringify(step.scan));
  check(`an edit leaves the right labels: ${name}`, wrong ? wrong.labels : result.labels, result.scan);
}

// A hundred pseudo-random edits, inserting the characters that decide where a
// line starts: the rule has to hold where a definition can be made and unmade.
let seed = 20260922;
const nextRandom = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const alphabet = ['a', ' ', '\n', '[', '^', ']', ':', '1', '2'];
const randomEdits = [];
const start = 'Body[^1] and [^2]\n\n[^1]: one\n\n[^2]: two\n';
let length = start.length;
for (let step = 0; step < 100; step += 1) {
  const from = Math.floor(nextRandom() * (length + 1));
  const to = Math.min(length, from + Math.floor(nextRandom() * 3));
  let inserted = '';
  const size = Math.floor(nextRandom() * 4);
  for (let index = 0; index < size; index += 1) {
    inserted += alphabet[Math.floor(nextRandom() * alphabet.length)];
  }
  randomEdits.push([from, to, inserted]);
  length += inserted.length - (to - from);
}
const random = folded(start, randomEdits);
const wrongStep = random.applied.find((step) => JSON.stringify(step.labels) !== JSON.stringify(step.scan));
check('a hundred pseudo-random edits leave the right labels', wrongStep ? wrongStep.labels : random.labels, random.scan);

// The cheap half of the rule: an edit that cannot touch a definition line hands
// back the set it was given, rather than scanning a long document again.
const labels = new Set(['1', '2']);
const typed = 'a paragraph with no definitions in it\n';
check('a keystroke in a paragraph keeps the set it had',
  labelsAfterEdit(labels, `a${typed.slice(1)}`, { from: 1, to: 1, removed: '', inserted: 'a' }) === labels, true);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('footnotes: all checks passed');
