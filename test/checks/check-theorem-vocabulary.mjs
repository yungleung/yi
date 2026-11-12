/**
 * Checks the document-owned theorem vocabulary that bridges app defaults and
 * pandoc-amsthm metadata.
 *
 * Example: a note may add `Conjecture`, rename `Theorem` to `定理`, and make
 * `Conjecture` share Theorem's counter without changing the app's defaults for
 * the next note. The reader must also isolate malformed declarations so one bad
 * entry cannot disable the rest of the vocabulary.
 *
 * May import: the bundled theorem facade under test. Upholds: the test reads
 * real metadata rules rather than a mock copy of them.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-theorem-vocabulary-'));
const bundle = await rolldown({
  input: 'src/ui/markdown/syntax/theorem/index.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'theorem.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const {
  theoremKindEdit,
  theoremVocabularyFromFrontmatter
} = await import(pathToFileURL(file).href);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
const type = (vocabulary, name) => vocabulary.byClass.get(name) ?? null;

const defaults = theoremVocabularyFromFrontmatter(null);
check(
  'only Theorem and proof are built in',
  defaults.types.map((entry) => entry.className).sort(),
  ['Theorem', 'proof']
);
check(
  'the default Theorem is numbered',
  [type(defaults, 'Theorem')?.style, type(defaults, 'Theorem')?.numbered],
  ['plain', true]
);
check(
  'proof is predefined and unnumbered',
  [type(defaults, 'proof')?.style, type(defaults, 'proof')?.numbered],
  ['proof', false]
);
check('Lemma requires a declaration', type(defaults, 'Lemma'), null);
check('Definition requires a declaration', type(defaults, 'Definition'), null);

const custom = theoremVocabularyFromFrontmatter([
  'amsthm:',
  '  plain:',
  '    - Theorem:',
  '        - Lemma',
  '    - Conjecture:',
  '        - Claim',
  '  name_to_text:',
  '    Theorem: 定理',
  '    Lemma: 引理',
  '    Conjecture: 猜想',
  '    Claim: 断言',
  '    proof: 证明',
  '  parent_counter:',
  '    Theorem: section'
].join('\n'));
check(
  'a custom theorem gets its document-owned title',
  type(custom, 'Conjecture')?.displayName,
  '猜想'
);
check(
  'a nested theorem shares its parent counter',
  type(custom, 'Claim')?.counter,
  'Conjecture'
);
check(
  'a parent counter reaches the environment that owns the counter',
  type(custom, 'Theorem')?.parentCounter,
  'section'
);
check(
  'an explicit built-in declaration replaces its default style',
  type(
    theoremVocabularyFromFrontmatter([
      'amsthm:',
      '  remark:',
      '    - Theorem'
    ].join('\n')),
    'Theorem'
  )?.style,
  'remark'
);

const unnumbered = theoremVocabularyFromFrontmatter([
  'amsthm:',
  '  plain:',
  '    - Conjecture*',
  '  name_to_text:',
  '    Conjecture*: 猜想'
].join('\n'));
check(
  'a trailing star removes the class marker but keeps a document title',
  [type(unnumbered, 'Conjecture')?.numbered, type(unnumbered, 'Conjecture')?.displayName],
  [false, '猜想']
);

const duplicate = theoremVocabularyFromFrontmatter([
  'amsthm:',
  '  plain:',
  '    - Claim',
  '  remark:',
  '    - Claim',
  '    - Remark'
].join('\n'));
check('a duplicate class is omitted', type(duplicate, 'Claim'), null);
check('an unrelated class survives the duplicate', type(duplicate, 'Remark')?.style, 'remark');

const unsafe = theoremVocabularyFromFrontmatter([
  'amsthm:',
  '  plain:',
  '    - Bad-Class',
  '    - Safe_Class'
].join('\n'));
check('an unsafe class is omitted', type(unsafe, 'Bad-Class'), null);
check('a safe custom class survives', type(unsafe, 'Safe_Class')?.style, 'plain');

check(
  'malformed YAML falls back to the app vocabulary',
  [type(theoremVocabularyFromFrontmatter('amsthm: ['), 'Theorem')?.style],
  ['plain']
);

check(
  'two equivalent readers produce the same cache key',
  theoremVocabularyFromFrontmatter(null).key,
  theoremVocabularyFromFrontmatter('').key
);

const bareDiv = '::: {#claim:one}\nBody.\n:::';
check(
  'choosing a theorem adds only its class',
  theoremKindEdit(bareDiv, 'Theorem', defaults),
  {
    from: 5,
    to: 5,
    replacement: '.Theorem '
  }
);
const theoremDiv = '::: {#claim:one .Theorem info="First"}\nBody.\n:::';
check(
  'changing the theorem edits only the class token',
  theoremKindEdit(theoremDiv, 'Lemma', custom),
  {
    from: 17,
    to: 24,
    replacement: 'Lemma'
  }
);
check(
  'Default removes theorem metadata but preserves the ID and note',
  theoremKindEdit(theoremDiv, 'default', defaults),
  {
    from: 4,
    to: 38,
    replacement: '{#claim:one info="First"}'
  }
);
check(
  'an undeclared theorem cannot be written',
  theoremKindEdit(bareDiv, 'Unknown', defaults),
  null
);

if (failures.length > 0) {
  console.error(failures.join('\n\n'));
  process.exit(1);
}

console.log('theorem vocabulary: all checks passed');
