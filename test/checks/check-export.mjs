/**
 * Checks the export's shared pre-process (`ui/export/preprocess.ts`) in Node. Two rules, both about
 * what the *app* knows and pandoc does not:
 *
 * - a wikilink is written as the words it renders as — the title the author gave it, or the title of
 *   the document it names, or its target;
 * - an image's destination is written as the file the app resolves it to, absolute and encoded, so
 *   the picture pandoc embeds is the picture the page showed: a destination read from the document's
 *   folder, from the image folder, spelled with `%20` or with spaces, or naming a file that is not
 *   there at all.
 *
 * The parse is what says where those spans *are*, so the shapes that are deliberately not one are
 * asserted here too: a fence's body, an inline code span, frontmatter, and a link's brackets. The
 * run itself — pandoc against the app's defaults file — is `test/probes/export-docx.js` and
 * `test/probes/export-pandoc-arguments.js`.
 *
 * The bundle is built for Node (`platform`), because the browser build of
 * `decode-named-character-reference` decodes entities by making a DOM element.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-export-'));
const bundle = await rolldown({
  input: 'src/ui/export/preprocess.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'preprocess.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { exportSource } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

/**
 * A workspace with these titles and these files, and what was asked about at all: every title the
 * pre-process looked up, and every path it looked for.
 */
function workspace({ titles = {}, files = [], document: documentFolder = '/notes', images = null } = {}) {
  const asked = [];
  const looked = [];
  const fetched = [];
  return {
    asked,
    looked,
    fetched,
    titleOf: async (target) => {
      asked.push(target);
      return titles[target] ?? null;
    },
    bases: { document: documentFolder, images },
    exists: async (path) => {
      looked.push(path);
      return files.includes(path);
    },
    // A picture on the web: the app fetches it itself, and this stands in for that fetch.
    fetchRemote: async (url) => {
      fetched.push(url);
      return url.includes('unfetchable') ? null : `/export/tmp/remote/${url.split('/').pop()}.png`;
    }
  };
}

const render = async (text, answers = {}) => {
  const notes = workspace(answers);
  const rendered = await exportSource(text, {
    titleOf: notes.titleOf,
    bases: notes.bases,
    exists: notes.exists,
    fetchRemote: notes.fetchRemote
  });
  return { rendered, asked: notes.asked, looked: notes.looked, fetched: notes.fetched };
};

// --- what a wikilink reads as ------------------------------------------------------------------

{
  const { rendered, asked } = await render('See [[target|the name I chose]].', {
    titles: { target: 'The Other Note' }
  });
  check('a title the author wrote wins over the document it names', rendered, 'See the name I chose.');
  check('and a link that names its own text is not resolved at all', asked, []);
}

{
  const { rendered, asked } = await render('See [[target]].', { titles: { target: 'The Other Note' } });
  check('a bare target reads as the title of the document it names', rendered, 'See The Other Note.');
  check('which is one question to the workspace', asked, ['target']);
}

{
  const { rendered } = await render('See [[nowhere]].');
  check('and a target no document answers is written as itself', rendered, 'See nowhere.');
}

{
  const { rendered } = await render('See [[target]].', { titles: { target: '' } });
  check('an empty title counts as no answer rather than as nothing to write', rendered, 'See target.');
}

{
  const { rendered, asked } = await render('[[a]] and [[a]] and [[b|b]].', { titles: { a: 'A' } });
  check(
    'one target is resolved once however many links name it',
    rendered,
    'A and A and b.'
  );
  check('and only the targets that need an answer are asked about', asked, ['a']);
}

// --- the rest of the note is untouched ---------------------------------------------------------

{
  const note = [
    '---',
    'title: A note about [[target]]',
    '---',
    '',
    '# A note about [[target]]',
    '',
    'The alias: [[target|an alias]] and the citation [@doe2001].',
    '',
    '![a picture](shot.png) and a [link](https://example.com/[[not a link]]).',
    '',
    'Inline `[[code]]` stays, and so does a fence:',
    '',
    '```md',
    '[[still code]]',
    '```',
    '',
    '> A quote with [[target]].',
    '',
    '- a list item with [[target|an alias]]',
    ''
  ].join('\n');
  const { rendered } = await render(note, { titles: { target: 'The Other Note' } });
  check(
    'a wikilink is written where it stands, and nothing else in the note moves',
    rendered,
    [
      '---',
      'title: A note about [[target]]',
      '---',
      '',
      '# A note about The Other Note',
      '',
      'The alias: an alias and the citation [@doe2001].',
      '',
      '![a picture](shot.png) and a [link](https://example.com/[[not a link]]).',
      '',
      'Inline `[[code]]` stays, and so does a fence:',
      '',
      '```md',
      '[[still code]]',
      '```',
      '',
      '> A quote with The Other Note.',
      '',
      '- a list item with an alias',
      ''
    ].join('\n')
  );
}

{
  const { rendered } = await render('No links here. Only [one] bracket.\n');
  check('a note with no wikilink is handed on character for character', rendered, 'No links here. Only [one] bracket.\n');
}

{
  const { rendered } = await render('A fence only:\n\n```\n[[target]]\n```\n', {
    titles: { target: 'Nope' }
  });
  check('and a wikilink that is a fence’s body is not a wikilink', rendered, 'A fence only:\n\n```\n[[target]]\n```\n');
}

// --- what an image's destination becomes --------------------------------------------------------

{
  const { rendered } = await render('Beside the note: ![shot.png](shot.png)', {
    files: ['/notes/shot.png']
  });
  check('an image beside the note is written as its own absolute path', rendered, 'Beside the note: ![shot.png](/notes/shot.png)');
}

{
  const { rendered } = await render('In the image folder: ![shot.png](shot.png)', {
    files: ['/pics/shot.png'],
    images: '/pics'
  });
  check('and one the image folder holds is found there', rendered, 'In the image folder: ![shot.png](/pics/shot.png)');
}

{
  const { looked } = await render('![a](shot.png)', { files: ['/notes/shot.png'] });
  check('the document’s own folder is tried before the settings’ image folder', looked, ['/notes/shot.png']);
}

{
  const written = '![a](shot with space.png)';
  const { rendered } = await render(written, { files: ['/notes/shot with space.png'] });
  check(
    'a name with a space is written encoded, so markdown reads the path as one destination',
    rendered,
    '![a](/notes/shot%20with%20space.png)'
  );
}

{
  const { rendered } = await render('![a](<shot with space.png>)', {
    files: ['/notes/shot with space.png']
  });
  check('however the author spelled it, wrapped or not', rendered, '![a](/notes/shot%20with%20space.png)');
}

{
  const { rendered } = await render('![a](shot%20with%20space.png)', {
    files: ['/notes/shot with space.png']
  });
  check('and a path copied as a browser spells it names the file it means', rendered, '![a](/notes/shot%20with%20space.png)');
}

{
  const name = 'a(1) b#c%.png';
  // A name with a space in it is written `<…>`-wrapped by the app, and this one holds every
  // character a destination could mean something else by.
  const { rendered } = await render(`![a](<${name}>)`, { files: [`/notes/${name}`] });
  check(
    'every character a destination could mean something else by is encoded',
    rendered,
    '![a](/notes/a(1)%20b%23c%25.png)'
  );
}

{
  // Parentheses balance, so markdown reads this one plainly — and it is still rewritten, because
  // what the app resolved is the answer, not what the characters looked like.
  const { rendered } = await render('![a](a(1).png)', { files: ['/notes/a(1).png'] });
  check('a destination markdown can read plainly is written as the path all the same', rendered, '![a](/notes/a(1).png)');
}

{
  const { rendered } = await render('![shot.png](shot.png "the picture")', {
    files: ['/notes/shot.png']
  });
  check('a title after the destination stays a title', rendered, '![shot.png](/notes/shot.png "the picture")');
}

{
  const { rendered } = await render('![a\\]b](shot.png)', { files: ['/notes/shot.png'] });
  check('and a bracket in the alt text is escaped, so the image is still one image', rendered, '![a\\]b](/notes/shot.png)');
}

{
  const written = '![gone.png](gone.png)';
  const { rendered } = await render(written, { files: [] });
  check('an image whose file is not there is left exactly as the author wrote it', rendered, written);
}

{
  const written = '![web](https://example.com/shot.png) and ![data](data:image/png;base64,AAAA)';
  const { rendered, looked, fetched } = await render(written, {
    // A picture on the web is fetched by the app — pandoc may not be able to (`export-web-image.js`
    // is that story with a real document) — and this one came back as a file.
  });
  check(
    'and one that names a picture on the web is written as the file the app fetched',
    rendered,
    '![web](/export/tmp/remote/shot.png.png) and ![data](data:image/png;base64,AAAA)'
  );
  check('nor is a local file looked for, for either of them', looked, []);
  check(
    'and a data URL is not fetched — pandoc reads those itself',
    fetched,
    ['https://example.com/shot.png']
  );
}

{
  const written = '![gone](https://example.com/unfetchable.png)';
  const { rendered } = await render(written);
  check('a picture the app cannot fetch is left exactly as the author wrote it', rendered, written);
}

{
  const { fetched } = await render('![a](https://example.com/pic.png) and ![b](https://example.com/pic.png)', {});
  check('and one URL is fetched once, however many images name it', fetched, ['https://example.com/pic.png']);
}

{
  const written = '```\n![a](shot.png)\n```\n';
  const { rendered } = await render(written, { files: ['/notes/shot.png'] });
  check('an image inside a fence is code, not an image', rendered, written);
}

// --- the two rules together ---------------------------------------------------------------------

{
  const { rendered } = await render('[[target]] then ![shot.png](shot.png) then [[target|a name]]\n', {
    titles: { target: 'The Other Note' },
    files: ['/notes/shot.png']
  });
  check(
    'a note with both is rewritten once, in one pass over the text',
    rendered,
    'The Other Note then ![shot.png](/notes/shot.png) then a name\n'
  );
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('export: all checks passed');
