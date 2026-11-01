/**
 * Checks the shape of a new note in Node: the id's fourteen digits and the date, the
 * frontmatter built from the reader's template with the four required keys guaranteed, and
 * where the title's value sits in the text.
 *
 * The whole rule is pure (`src/services/new_document/index.ts`), so it is asserted here rather
 * than through the app; the dialog and the tree that call it are driven by
 * `test/probes/new-markdown.js`.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-new-document-'));

/** Bundles one module and imports it, the way every check loads its subject. */
async function bundleModule(input, name) {
  const bundle = await rolldown({ input, logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return import(file);
}

const {
  DEFAULT_KEYWORDS,
  DEFAULT_TEMPLATE,
  DEFAULT_TITLE,
  REQUIRED_KEYS,
  mergeFrontmatterTemplates,
  newDocumentDate,
  newDocumentId,
  newDocumentText,
  titleRange
} = await bundleModule('src/services/new_document/index.ts', 'new_document');
const {
  BUILT_IN_NOTE_METADATA,
  BUILTIN_NOTE_TEMPLATES
} = await bundleModule(
  'src/services/new_document/builtins.ts',
  'new_document_builtins'
);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

/** The keys a frontmatter names, in the order they are written. */
const keysIn = (text) =>
  text
    .split('\n')
    .map((line) => /^\s*([A-Za-z_][\w.-]*)\s*:/.exec(line)?.[1])
    .filter(Boolean);

// --- the id and the date ---

const when = new Date(2026, 8, 29, 8, 5, 3);
check('the id is a fourteen-digit stamp', newDocumentId(when), '20260929080503');
check('and it reads the local clock, not UTC', newDocumentId(when).slice(8), '080503');
check('the date is the day it was made', newDocumentDate(when), '2026-09-29');
check(
  'both pad their parts, so an early-morning note still has fourteen digits',
  [newDocumentId(new Date(2026, 0, 2, 3, 4, 5)), newDocumentDate(new Date(2026, 0, 2, 3, 4, 5))],
  ['20260102030405', '2026-01-02']
);

// --- the frontmatter ---

const STAMP = { id: '20260929080503', date: '2026-09-29' };
const DEFAULT_TEXT =
  '---\ntitle: Untitle\ndate: 2026-09-29\nid: 20260929080503\nkeywords:\n  - untagged\n---\n\n';

check(
  'a new note opens with the four keys, in the order the ask names them',
  newDocumentText(STAMP),
  DEFAULT_TEXT
);
check(
  'which is the built-in template',
  DEFAULT_TEMPLATE,
  'title: Untitle\ndate:\nid:\nkeywords:\n  - untagged'
);
check(
  'and it ends with a blank line, so the body does not join the frontmatter',
  DEFAULT_TEXT.endsWith('---\n\n'),
  true
);

const withAll = '---\ntitle: A note\ndate: 2020-01-01\nid: 19991231235959\nkeywords: physics\n---\n\n';
const stampedAll = '---\ntitle: A note\ndate: 2026-09-29\nid: 20260929080503\nkeywords: physics\n---\n\n';
check(
  'a template naming all four keeps its words, but is stamped with the app id and date',
  newDocumentText({ ...STAMP, template: withAll }),
  stampedAll
);
check(
  'a keyword list of the reader\'s own is kept, however long it is',
  newDocumentText({ ...STAMP, template: 'keywords:\n  - physics\n  - history\n' }),
  '---\nkeywords:\n  - physics\n  - history\ntitle: Untitle\ndate: 2026-09-29\nid: 20260929080503\n---\n\n'
);
check(
  'and a value written under its key is not taken for a missing one',
  newDocumentText({ ...STAMP, template: 'title:\n  A title on the next line\n' }),
  '---\ntitle:\n  A title on the next line\ndate: 2026-09-29\nid: 20260929080503\nkeywords:\n  - untagged\n---\n\n'
);
check(
  'a template written without its fences is read the same way',
  newDocumentText({ ...STAMP, template: withAll.slice(4, -5) }),
  stampedAll
);
check(
  'the reader keeps their own keys, their own order and their comments',
  newDocumentText({
    ...STAMP,
    template: '# what this note is\nauthor: Ursula\ntitle: A note\ncssclass: wide\ndate:\nkeywords:'
  }),
  '---\n# what this note is\nauthor: Ursula\ntitle: A note\ncssclass: wide\ndate: 2026-09-29\nkeywords:\n  - untagged\nid: 20260929080503\n---\n\n'
);

const valueFor = { title: 'A note', date: '', id: '', keywords: 'physics' };
for (const missing of REQUIRED_KEYS) {
  const body = REQUIRED_KEYS.filter((key) => key !== missing)
    .map((key) => `${key}: ${valueFor[key]}`)
    .join('\n');
  const text = newDocumentText({ ...STAMP, template: body });
  const keys = keysIn(text);
  check(
    `a template missing ${missing} keeps the keys it had, in place`,
    keys.filter((key) => key !== missing),
    REQUIRED_KEYS.filter((key) => key !== missing)
  );
  check(`and has the ${missing} it was missing added`, keys.includes(missing), true);
  check(
    `the ${missing} it gains is the one it should be`,
    new RegExp(
      `^(title: Untitle|date: 2026-09-29|id: 20260929080503|keywords:\\n  - untagged)$`,
      'm'
    ).test(text),
    true
  );
}

check(
  'a title left empty is the default one, because a note must open with something to select',
  newDocumentText({ ...STAMP, template: 'title:\n' }),
  DEFAULT_TEXT
);
check(
  'and so is a keywords left empty',
  newDocumentText({ ...STAMP, template: 'keywords:   \n' }),
  '---\nkeywords:\n  - untagged\ntitle: Untitle\ndate: 2026-09-29\nid: 20260929080503\n---\n\n'
);
check(
  "a template naming a key twice is the author's own: the app adds nothing and takes nothing",
  keysIn(newDocumentText({ ...STAMP, template: 'title: One\ntitle: Two' })).filter((key) => key === 'title').length,
  2
);
check(
  'and an empty template still yields the four keys',
  keysIn(newDocumentText({ ...STAMP, template: '' })),
  [...REQUIRED_KEYS]
);
check("the defaults are the ask's own words", [DEFAULT_TITLE, DEFAULT_KEYWORDS], ['Untitle', 'untagged']);

// --- a package's metadata ---

const readerTemplate =
  'title: Default title\nauthor: Default author\ndate:\nid:\nkeywords:\n  - untagged\nreviewed: false';
const packageMetadata =
  'title: Template title\nauthor: Template Author\ndate: 1999-01-01\nid: old-id\nkeywords:\n  - journal\ncategory:\n  name: article';
check(
  'a package metadata block supplies its keys first and the default supplies only the rest',
  mergeFrontmatterTemplates(readerTemplate, packageMetadata),
  'title: Template title\nauthor: Template Author\ndate: 1999-01-01\nid: old-id\nkeywords:\n  - journal\ncategory:\n  name: article\nreviewed: false'
);
check(
  'and the app still stamps its date and id over the package values',
  newDocumentText({ ...STAMP, template: readerTemplate, metadata: packageMetadata }),
  '---\ntitle: Template title\nauthor: Template Author\ndate: 2026-09-29\nid: 20260929080503\nkeywords:\n  - journal\ncategory:\n  name: article\nreviewed: false\n---\n\n'
);
check(
  'a metadata file with no value for a required key falls back to the default',
  newDocumentText({ ...STAMP, template: readerTemplate, metadata: 'author: Package author' }),
  '---\nauthor: Package author\ntitle: Default title\ndate: 2026-09-29\nid: 20260929080503\nkeywords:\n  - untagged\nreviewed: false\n---\n\n'
);
let invalidMetadata = null;
try {
  mergeFrontmatterTemplates(readerTemplate, 'title: [unclosed');
} catch (error) {
  invalidMetadata = error instanceof Error ? error.message : String(error);
}
check(
  'broken package metadata is refused instead of becoming a broken note',
  invalidMetadata?.includes('not valid YAML') ?? false,
  true
);

// --- built-in presentation metadata ---

check(
  'the built-in choices are Reveal.js and Beamer',
  BUILTIN_NOTE_TEMPLATES.map((template) => [template.id, template.kind]),
  [
    ['builtin:revealjs', 'revealjs'],
    ['builtin:beamer', 'beamer']
  ]
);
check(
  'the Reveal.js starter carries presentation metadata',
  [
    'theme: black',
    'transition: slide',
    'slide-level: 2',
    'incremental: false'
  ].every((line) => BUILT_IN_NOTE_METADATA['builtin:revealjs'].split('\n').includes(line)),
  true
);
check(
  'the Beamer starter carries presentation metadata',
  [
    'theme: default',
    'colortheme: default',
    'fonttheme: default',
    'aspectratio: 169',
    'section-titles: true'
  ].every((line) => BUILT_IN_NOTE_METADATA['builtin:beamer'].split('\n').includes(line)),
  true
);
check(
  'the built-in starters still obey the app date and id stamps',
  newDocumentText({
    ...STAMP,
    metadata: BUILT_IN_NOTE_METADATA['builtin:beamer']
  }).includes('date: 2026-09-29\nid: 20260929080503\n'),
  true
);

// --- the title's range ---

const range = titleRange(DEFAULT_TEXT);
check('the title range covers the title value', DEFAULT_TEXT.slice(range.start, range.end), 'Untitle');
/** The text a range covers, for the cases below. */
const covered = (text) => {
  const found = titleRange(text);
  return found === null ? null : text.slice(found.start, found.end);
};
check('and a quoted title leaves its quotes out of the range', covered('---\nauthor: me\ntitle: "A quoted name"\n---\n\nBody\n'), 'A quoted name');
check('a single-quoted title too', covered("---\ntitle: 'Another'\n---\n\n"), 'Another');
check('a document with no frontmatter has no title range', titleRange('# Heading\n\nBody\n'), null);
check('nor has one whose title is empty', titleRange('---\ntitle:\n---\n\n'), null);
check('a title in the body is not the frontmatter title', titleRange('---\nid: x\n---\n\ntitle: body word\n'), null);
check('a frontmatter closed by ... is still the frontmatter', covered('---\ntitle: "Ends with dots"\n...\n\nBody\n'), 'Ends with dots');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('new document: all checks passed');
