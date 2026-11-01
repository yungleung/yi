/**
 * The book the app writes, held to W3C's validator.
 *
 * An EPUB is a container with rules no converter has to know, and one of them is that an id is used
 * once in the document it stands in. The book built here is the one the app builds for a note whose
 * level-1 heading is its frontmatter `title:` and whose first section repeats that name: the window
 * writes the name where the note's level-1 heading belongs (`ui/export/pipeline/book_body.ts`, the kind's own
 * `names_its_body`), and the note goes to pandoc with the shipped defaults file and that name as the
 * book's title. Measured with pandoc 3.12 and epubcheck 5.4.0, both halves of that book have to be
 * right, and each of them alone is not enough — the EPUB writer makes a heading of its own out of the
 * book's own name whenever the body's first chunk has no level-1 heading of its own, and that
 * heading is not part of the document pandoc makes identifiers unique in, so:
 *
 * - with `shift-heading-level-by: 1`, the family's shape, the name written into the note is shifted
 *   down to level 2 and the writer makes its own heading above it — `Duplicate ID "going-out"`;
 * - with the note handed over as it stands (no name written in), the writer's heading and the note's
 *   `## Going out` are two elements with that id on one page — the same two errors.
 *
 * This is what says both are gone: with `shift-heading-level-by: 1` back in the file, or with the
 * name left out of the body, epubcheck reports
 *
 *     ERROR(RSC-005): …/EPUB/text/ch001.xhtml(13,51): Duplicate ID "going-out"
 *
 * twice, and this check fails.
 *
 * The two tools are found, never assumed: `npm run check` has to stay green on a machine with
 * neither, so a missing `pandoc`, `java` or epubcheck jar is a skip with a line saying which. The
 * jar is looked for where the roadmap's epub item put one — the release zip extracted whole, since
 * the jar needs its own `lib/` beside it — under `~/.cache/yi-tools/epubcheck/<version>/epubcheck.jar`,
 * and `YI_EPUBCHECK` names one anywhere else.
 *
 * It reads the *shipped* defaults file rather than the reader's copy of it: the app writes the
 * shipped bytes out for a reader who has none, and a reader whose copy is older is offered the
 * replacement on the card (`export-config-replace.js`). What this holds is the file this build ships.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { epubcheckJar, have, runEpubcheck } from './support/epubcheck.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const defaults = join(root, 'src-tauri/assets/export/export.epub.yaml');

const missing = [];
if (!have('pandoc', '--version')) {
  missing.push('pandoc');
}
if (!have('java', '-version')) {
  missing.push('java');
}
const jar = epubcheckJar();
if (jar === null) {
  missing.push(`epubcheck (looked in ~/.cache/yi-tools/epubcheck, or name one with YI_EPUBCHECK)`);
}
if (missing.length > 0) {
  console.log(`epub validity: skipped, no ${missing.join(', ')}`);
  process.exit(0);
}

/**
 * The note this holds, and the name the app would take from it: a note whose title is its frontmatter
 * (`documentTitle`: the frontmatter title, else the first `#` heading, else the file's name) and whose
 * first section repeats it. Written rather than committed because the *shape* is the fixture, and a
 * file in `test/fixtures/` would be a second place to read it from.
 */
const note = '---\ntitle: Going out\n---\n\n## Going out\n\nSome text.\n';
const name = 'Going out';

// The text a book is handed, from the app's own rule — so what pandoc is asked about is the app's
// answer and not this check's idea of it.
const bundle = await rolldown({
  input: join(root, 'src/ui/export/pipeline/book_body.ts'),
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const bundleDirectory = mkdtempSync(join(tmpdir(), 'yi-epub-valid-rule-'));
const ruleFile = join(bundleDirectory, 'book_body.mjs');
writeFileSync(ruleFile, output.find((chunk) => chunk.type === 'chunk').code);
const { bodyWithItsName } = await import(ruleFile);

const directory = mkdtempSync(join(tmpdir(), 'yi-epub-valid-'));
const notePath = join(directory, 'note.md');
const bookPath = join(directory, 'book.epub');

const failures = [];

const handed = bodyWithItsName(note, name);
if (!handed.startsWith('---\ntitle: Going out\n---\n# Going out\n')) {
  failures.push(
    `the app's rule did not write the note's name where its level-1 heading belongs\n` +
      `  ${JSON.stringify(handed)}`
  );
}
writeFileSync(notePath, handed);

// The app's own command line for a book: the kind's defaults file, the note's name and the language
// the app speaks, and the note. The window sends both whatever the kind is and the *kind* decides
// (`export.rs: takes_a_title`, `needs_a_language`), so these two are epub's.
const built = spawnSync(
  'pandoc',
  [
    '--defaults',
    defaults,
    '--metadata',
    'title=Going out',
    '--metadata',
    'lang=en-GB',
    '--output',
    bookPath,
    notePath
  ],
  { cwd: root, encoding: 'utf8', timeout: 60_000 }
);
if (built.error !== undefined || built.status !== 0) {
  failures.push(
    `pandoc did not write a book\n  ${built.error?.message ?? ''}${built.stderr?.trim() ?? ''}`
  );
}

if (failures.length === 0) {
  const checked = runEpubcheck(bookPath);
  if (!checked.ok) {
    failures.push(
      [
        'epubcheck did not pass the book the app writes',
        ...checked.complaints.map((line) => `  ${line}`),
        checked.counts !== '' ? `  ${checked.counts}` : '  epubcheck said nothing'
      ].join('\n')
    );
  } else {
    console.log(`epubcheck on the book this build writes: ${checked.counts}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('epub validity: all checks passed');
