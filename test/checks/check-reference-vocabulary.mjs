/**
 * Checks the document-owned words and prefixes used by automatic references.
 *
 * The mapping is Markdown metadata, not interface localization: each supported
 * key falls back independently when its value is missing or malformed.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-reference-vocabulary-'));
const bundle = await rolldown({
  input: 'src/ui/markdown/syntax/reference_vocabulary.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'reference_vocabulary.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const {
  DEFAULT_REFERENCE_VOCABULARY,
  referenceNumberText,
  referenceVocabularyFromFrontmatter
} = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

check(
  'missing metadata gives every kind its English label and no prefix',
  referenceVocabularyFromFrontmatter(null),
  {
    figure: { label: 'Figure', prefix: '' },
    listing: { label: 'Listing', prefix: '' },
    table: { label: 'Table', prefix: '' },
    equation: { label: 'Equation', prefix: '' },
    list: { label: 'List', prefix: '' }
  }
);

const configured = referenceVocabularyFromFrontmatter(`
reference-labels:
  figure: Diagram
  listing: Code excerpt
reference-number-prefixes:
  figure: "2-"
  listing: "A."
`);
check('labels and prefixes are read together', configured.figure, {
  label: 'Diagram',
  prefix: '2-'
});
check(
  'a figure number is the label, one space, prefix, and number',
  referenceNumberText('figure', 1, configured),
  'Diagram 2-1'
);
check(
  'an equation keeps its shared parentheses',
  referenceNumberText('equation', 3, {
    ...DEFAULT_REFERENCE_VOCABULARY,
    equation: { label: 'Equation', prefix: '2-' }
  }),
  'Equation (2-3)'
);

const partial = referenceVocabularyFromFrontmatter(`
reference-labels:
  listing: 42
  figure: Diagram
reference-number-prefixes:
  listing: 9
  figure: A-
`);
check('an invalid value falls back without discarding valid siblings', partial, {
  figure: { label: 'Diagram', prefix: 'A-' },
  listing: { label: 'Listing', prefix: '' },
  table: { label: 'Table', prefix: '' },
  equation: { label: 'Equation', prefix: '' },
  list: { label: 'List', prefix: '' }
});

check(
  'a non-mapping falls back in full',
  referenceVocabularyFromFrontmatter('reference-labels: one\n'),
  DEFAULT_REFERENCE_VOCABULARY
);
check(
  'malformed YAML falls back in full',
  referenceVocabularyFromFrontmatter('reference-labels: [\n'),
  DEFAULT_REFERENCE_VOCABULARY
);
check(
  'a whitespace-only label falls back',
  referenceVocabularyFromFrontmatter('reference-labels:\n  figure: "   "\n').figure.label,
  'Figure'
);
check(
  'a non-empty prefix keeps the spelling the author chose',
  referenceVocabularyFromFrontmatter(`
reference-number-prefixes:
  figure: " A "
`).figure.prefix,
  ' A '
);
check(
  'unknown keys are ignored',
  referenceVocabularyFromFrontmatter('reference-labels:\n  chart: Chart\n').listing.label,
  'Listing'
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('reference vocabulary: all checks passed');
