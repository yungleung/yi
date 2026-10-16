/**
 * The book the app writes, held to W3C's validator.
 *
 * An EPUB is a container with rules no converter has to know, and one of them is that an id is used
 * once in the document it stands in. The book built here is the shape the app's own naming makes of a
 * note: a note whose first heading is what the note is called, handed over as the *book's* name too
 * (`--metadata title=…`, which the window does for every kind that carries its own name). Measured
 * with pandoc 3.12 and epubcheck 5.4.0, the EPUB writer gives the first chunk of the body the book's
 * name as a heading of its own whenever the note's own first heading is not a level-1 one, so a
 * shipped `shift-heading-level-by: 1` — the family's shape, for a title above a document's first
 * heading — nested the note's `#` heading inside the writer's copy of the same words, and both
 * sections claimed `going-out`. The shipped file shifts by 0 now, and this is what says so: with
 * `shift-heading-level-by: 1` back in the file, epubcheck reports
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
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const defaults = join(root, 'src-tauri/assets/export/export.epub.yaml');

/** Whether a program answers at all — the one thing a skip is decided by. */
const have = (program, argument) => spawnSync(program, [argument], { encoding: 'utf8' }).error === undefined;

/** The epubcheck jar: the one `YI_EPUBCHECK` names, else the newest under the cache folder. */
function epubcheckJar() {
  const named = process.env.YI_EPUBCHECK;
  if (named !== undefined && named !== '') {
    return existsSync(named) ? named : null;
  }
  const cache = join(homedir(), '.cache/yi-tools/epubcheck');
  if (!existsSync(cache)) {
    return null;
  }
  const versions = readdirSync(cache).sort();
  for (const version of versions.reverse()) {
    const jar = join(cache, version, 'epubcheck.jar');
    if (existsSync(jar)) {
      return jar;
    }
  }
  return null;
}

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
 * The note this holds: the app's own naming shape, three lines of it — a `#` heading that says what
 * the note is called, and the text under it. It is written rather than committed because the *shape*
 * is the fixture, and a file in `test/fixtures/` would be a second place to read it from.
 */
const note = '# Going out\n\nSome text.\n';
const directory = mkdtempSync(join(tmpdir(), 'yi-epub-valid-'));
const notePath = join(directory, 'note.md');
const bookPath = join(directory, 'book.epub');
writeFileSync(notePath, note);

const failures = [];

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
  const checked = spawnSync('java', ['-jar', jar, bookPath], { encoding: 'utf8', timeout: 300_000 });
  const verdict = `${checked.stdout ?? ''}${checked.stderr ?? ''}`;
  const complaints = verdict.split('\n').filter((line) => /^(ERROR|FATAL)\(/.test(line));
  const counts = verdict.split('\n').find((line) => line.startsWith('Messages:')) ?? '';
  if (checked.status !== 0 || complaints.length > 0) {
    failures.push(
      [
        'epubcheck did not pass the book the app writes',
        ...complaints.map((line) => `  ${line}`),
        counts !== '' ? `  ${counts}` : `  epubcheck said nothing: ${checked.error?.message ?? `exit ${checked.status}`}`
      ].join('\n')
    );
  } else {
    console.log(`epubcheck on the book this build writes: ${counts}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('epub validity: all checks passed');
