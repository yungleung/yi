/**
 * The pictures an export cannot use (`ui/export/picture_hint.ts`): a `data:` URL that names something
 * which is not an image, and nothing else.
 *
 * The rule exists because the failure is silent: measured, a docx carries such a destination into
 * `word/media/` as a `.txt` without a word of warning, and a pdf gets pandoc's own complaint about a
 * temporary path. What is held here is the judgement itself — which destinations are no image, that a
 * picture's own `data:` URL is not one of them, and that only the *parse's* images count (a `data:` URL
 * in a fence or a code span is text). What the card then does with the list is
 * `test/probes/export-picture-hint.js`'s.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-picture-hint-'));
const bundle = await rolldown({
  input: 'src/ui/export/picture_hint.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'picture_hint.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { destinationsThatNameNoImage, imageDestinations, isWebDestination, namesNoImage } =
  await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

// What names an image, and what does not.
check('a png data URL is a picture', namesNoImage('data:image/png;base64,iVBORw0KGgo='), false);
check('and any image type is', namesNoImage('data:IMAGE/JPEG;base64,/9j/4AAQ'), false);
check('a text data URL is not', namesNoImage('data:text/plain;base64,aGVsbG8='), true);
check('nor is one that names no type at all', namesNoImage('data:;base64,aGVsbG8='), true);
check('and the spaces a reader may write are not the media type', namesNoImage('data: text/plain,x'), true);
check('a URL is not this rule’s business', namesNoImage('https://example.com/shot.png'), false);
check('nor is a path', namesNoImage('shot.png'), false);
check('nor is a data URL that is not written at the start', namesNoImage('x data:text/plain,y'), false);

// What the app fetches, and what it reads from disk.
check('an http URL is a picture on the web', isWebDestination('http://example.com/shot.png'), true);
check(
  'and so is https, with the spaces a reader may leave',
  isWebDestination('  HTTPS://example.com/a.svg '),
  true
);
check('a file URL is not fetched by the app', isWebDestination('file:///tmp/shot.png'), false);
check('nor is a local path', isWebDestination('images/shot.png'), false);

// What the note's own images say, read from the parse.
check(
  'a note whose image names a text data URL reports it',
  destinationsThatNameNoImage('# A\n\n![x](data:text/plain;base64,aGVsbG8=)\n'),
  ['data:text/plain;base64,aGVsbG8=']
);
check(
  'a data URL written twice is reported once',
  destinationsThatNameNoImage('![x](data:text/plain,a)\n\n![x](data:text/plain,a)\n'),
  ['data:text/plain,a']
);
check(
  'and the picture a data URL names is not reported at all',
  destinationsThatNameNoImage('![x](data:image/png;base64,iVBORw0KGgo=)\n'),
  []
);
check(
  'a data URL inside a fence is text, not an image',
  destinationsThatNameNoImage('```md\n![x](data:text/plain,a)\n```\n'),
  []
);
check(
  'and one inside a code span is text too',
  destinationsThatNameNoImage('An example: `![x](data:text/plain,a)`\n'),
  []
);
check('a note with no images has nothing to say', destinationsThatNameNoImage('# A\n\ntext\n'), []);

// The destinations the note's own images name, which is what an export draws from.
check(
  'the note’s image destinations are read in the order they are written, each once',
  imageDestinations('![a](one.svg)\n\n![a](one.svg)\n\n![b](data:image/png;base64,cG5n)\n'),
  ['one.svg', 'data:image/png;base64,cG5n']
);
check(
  'and a destination inside a fence is not one of them',
  imageDestinations('```md\n![x](not-an-image.svg)\n```\n'),
  []
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('picture hint: all checks passed');
