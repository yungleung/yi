/**
 * Checks what the caret is inside when a list should open, and which entries belong in it
 * (`syntax/completions.ts`) in Node: a citation query and the places a `@` is not one, a wikilink
 * query, and the filtering and ordering of the choices.
 *
 * The rules are pure, so they are asserted here; the popup itself is `test/probes/completion*.js`.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-completions-'));

/** Bundles one module and imports it, the way every check loads its subject. */
async function bundleModule(input, name) {
  const bundle = await rolldown({ input, logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return import(file);
}

const { autoReferenceQuery, citationQuery, matchingChoices, wikilinkQuery } = await bundleModule(
  'src/ui/markdown/syntax/completions.ts',
  'completions'
);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

// --- the citation query ------------------------------------------------------------------------

check('an @ with the caret after it asks for everything', citationQuery('@', 1), { from: 1, query: '' });
check('and what is typed narrows it', citationQuery('see @smi', 8), { from: 5, query: 'smi' });
check('a key with pandoc punctuation is still one key', citationQuery('@smith:2020', 11), {
  from: 1,
  query: 'smith:2020'
});
check('an email is not a citation', citationQuery('contact@example.com', 15), null);
check('nor is an escaped @', citationQuery('\\@key', 5), null);
check('nor is a caret that has left the key', citationQuery('@key and then some', 18), null);
check('nor is a @ inside a locator', citationQuery('[@key, p. 33]', 13), null);
check('an @ right after a key character is not a citation either', citationQuery('@a@b', 4), null);

// --- the wikilink query ------------------------------------------------------------------------

check('two brackets ask for a target', wikilinkQuery('[[', 2), { from: 2, query: '' });
check('and what is typed narrows it', wikilinkQuery('see [[Note', 10), { from: 6, query: 'Note' });
check('one bracket is not a wikilink', wikilinkQuery('[', 1), null);
check('nor is a bracket with no pair', wikilinkQuery('plain [Note', 11), null);
check('and the caret inside a wikilink that has a target asks for that target', wikilinkQuery('[[Note]]', 6), { from: 2, query: 'Note' });
check('while a caret past its closing brackets asks for nothing', wikilinkQuery('[[Note]]', 8), null);
check('and a newline stops the query', wikilinkQuery('[[a\nb', 5), null);

// --- the automatic-reference query -------------------------------------------------------------

check('`[#` asks for a document target', autoReferenceQuery('[#', 2), {
  from: 2,
  query: ''
});
check('and typing narrows it', autoReferenceQuery('See [#fig:sample', 16), {
  from: 6,
  query: 'fig:sample'
});
check('a caret before the closing bracket still asks', autoReferenceQuery('[#tbl:results]', 13), {
  from: 2,
  query: 'tbl:results'
});
check(
  'a caret after the closing bracket asks for nothing',
  autoReferenceQuery('[#tbl:results]', 14),
  null
);
check('an escaped reference opening asks for nothing', autoReferenceQuery('\\[#fig', 6), null);
check(
  'whitespace ends an automatic-reference query',
  autoReferenceQuery('[#fig sample', 11),
  null
);

// --- the choices -------------------------------------------------------------------------------

const ENTRIES = [
  { value: 'smith2020', title: 'Code review matters' },
  { value: 'smithies2019', title: 'Something else' },
  { value: 'jones2019', title: 'A Smith among Joneses' },
  { value: 'abe2021', title: 'Smith and the review' }
];

check(
  'an empty query offers everything, in the order it came',
  matchingChoices(ENTRIES, '').map((choice) => choice.value),
  ['smith2020', 'smithies2019', 'jones2019', 'abe2021']
);
check(
  'a key that starts with the query comes first, then a title that does',
  matchingChoices(ENTRIES, 'smith').map((choice) => choice.value),
  // A title that *starts* with the query is a better match than one that holds it mid-way.
  ['smith2020', 'smithies2019', 'abe2021', 'jones2019']
);
check(
  'and a title match is enough on its own',
  matchingChoices(ENTRIES, 'review').map((choice) => choice.value),
  ['smith2020', 'abe2021']
);
check('nothing matching is an empty list', matchingChoices(ENTRIES, 'zzz'), []);
check(
  'the list stops at the limit',
  matchingChoices(ENTRIES, '', 2).map((choice) => choice.value),
  ['smith2020', 'smithies2019']
);
check('the query is matched without regard to case', matchingChoices(ENTRIES, 'SMITH').length, 4);
check(
  'a document with an id and one without are both offered by title',
  matchingChoices(
    [
      { value: '20260101120000', title: 'A dated note' },
      { value: 'Undated thought', title: 'Undated thought' }
    ],
    'thought'
  ).map((choice) => choice.value),
  ['Undated thought']
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('completions: all checks passed');
