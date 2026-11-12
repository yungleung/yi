/**
 * Checks how an image is written in Node: the markdown of `![alt](destination)` and where the
 * caret lands, which clipboard text counts as a destination, the alt and the file name a
 * destination suggests, and the kind an image is encoded as.
 *
 * The whole rule is pure (`src/ui/markdown/syntax/image_edits.ts`), so it is asserted here rather
 * than through the app; the button, the clipboard and the dialog are driven by
 * `test/probes/insert-image*.js`. The path arithmetic a destination is read with is beside the
 * other path rules (`test/checks/check-workspace-folders.mjs`).
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-image-edits-'));

/** Bundles one module and imports it, the way every check loads its subject. */
async function bundleModule(input, name) {
  const bundle = await rolldown({ input, logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return import(pathToFileURL(file).href);
}

const { clipboardImageDestination, imageFileName, imageInsertion, imageKindFor, imageTitleFromUrl } =
  await bundleModule('src/ui/markdown/syntax/image_edits.ts', 'image_edits');

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

// --- the markdown ---------------------------------------------------------------------------

check(
  'an image is a link with a bang, and the caret sits at the end of its alt text',
  imageInsertion('A picture', 'pics/a.png'),
  { markdown: '![A picture](pics/a.png)', caret: 11 }
);
check('an image with no destination is still written, for the author to fill in', imageInsertion('', null), {
  markdown: '![]()',
  caret: 2
});
check(
  'a destination markdown cannot read plainly is wrapped, exactly as a link wraps one',
  imageInsertion('x', '/Users/me/My Pictures/a (1).png'),
  { markdown: '![x](</Users/me/My Pictures/a (1).png>)', caret: 3 }
);
check(
  'and the alt text is escaped, exactly as a link escapes one',
  imageInsertion('a [b] \\ c', 'a.png'),
  { markdown: '![a \\[b\\] \\\\ c](a.png)', caret: 14 }
);

// --- what a clipboard is offering ------------------------------------------------------------

check('a web URL is a destination', clipboardImageDestination('https://x.example/a.png'), 'https://x.example/a.png');
check('so is a URL with no extension', clipboardImageDestination('https://x.example/pic'), 'https://x.example/pic');
check('a file URL too', clipboardImageDestination('file:///Users/me/a.png'), 'file:///Users/me/a.png');
check('an absolute path to an image is one', clipboardImageDestination('/Users/me/pics/a.png'), '/Users/me/pics/a.png');
check('and so is one from a home folder', clipboardImageDestination('~/pics/a.jpeg'), '~/pics/a.jpeg');
check('a relative path too', clipboardImageDestination('pics/a.png'), 'pics/a.png');
check('with the whitespace the clipboard wrapped it in taken off', clipboardImageDestination('\n  a.png \t'), 'a.png');
check('several words are not a destination', clipboardImageDestination('look at this picture'), null);
check('nor is a file that is not an image', clipboardImageDestination('/Users/me/notes.md'), null);
check('nor a bare word', clipboardImageDestination('a-picture'), null);
check('nor an empty clipboard', clipboardImageDestination('   \n'), null);
check('nor a path with a space in it, which cannot be told from a sentence', clipboardImageDestination('/Users/me/My Pictures/a.png'), null);
check('and a javascript: URL is not one either', clipboardImageDestination('javascript:alert(1)'), null);

// --- the alt and the name a destination suggests ----------------------------------------------

check('an alt comes from the file name', imageTitleFromUrl('/Users/me/pics/A picture.png'), 'A picture');
check('and from a URL, without its query', imageTitleFromUrl('https://x.example/a/b/pic.png?w=200#top'), 'pic');
check('with what the URL escaped decoded', imageTitleFromUrl('https://x.example/A%20picture.png'), 'A picture');
check('a destination with no name leaves the alt empty', imageTitleFromUrl('https://x.example/'), '');

check("an empty name is the app's own stamp, as a PNG", imageFileName('   ', '20260929031513'), '20260929031513.png');
check('a name with no extension becomes a PNG', imageFileName('a picture', 'x'), 'a picture.png');
check('one that asks for jpeg keeps it', imageFileName('a.jpg', 'x'), 'a.jpg');
check('and one asking for a kind this app cannot write is a PNG, and says so', imageFileName('a.bmp', 'x'), 'a.png');
check('a name that would name another folder is refused', imageFileName('pics/a.png', 'x'), null);
check('and so is a hidden one, which the tree would hide', imageFileName('.a.png', 'x'), null);
check(
  'the kind is the one the name asks for, and PNG for anything else',
  [imageKindFor('a.png'), imageKindFor('a.JPG'), imageKindFor('a.jpeg'), imageKindFor('a.webp'), imageKindFor('a.bmp'), imageKindFor('a')],
  ['image/png', 'image/jpeg', 'image/jpeg', 'image/webp', 'image/png', 'image/png']
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('image edits: all checks passed');
