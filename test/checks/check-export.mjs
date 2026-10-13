/**
 * Checks the export's shared pre-process (`ui/export/preprocess.ts`) in Node: a wikilink is written
 * as the words it renders as — the title the author gave it, or the title of the document it names,
 * or its target — and every other character of the note is left exactly as it was written.
 *
 * The parse is what says where the wikilinks *are*, so the shapes that are deliberately not one are
 * asserted here too: a fence's body, an inline code span, frontmatter, and an image's brackets. The
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
const { withRenderedWikilinks } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

/** Every title a workspace answers with, and which targets were asked about at all. */
function workspace(titles) {
  const asked = [];
  return {
    asked,
    titleOf: async (target) => {
      asked.push(target);
      return titles[target] ?? null;
    }
  };
}

const render = async (text, titles = {}) => {
  const notes = workspace(titles);
  const rendered = await withRenderedWikilinks(text, notes.titleOf);
  return { rendered, asked: notes.asked };
};

// --- what a wikilink reads as ------------------------------------------------------------------

{
  const { rendered, asked } = await render('See [[target|the name I chose]].', {
    target: 'The Other Note'
  });
  check('a title the author wrote wins over the document it names', rendered, 'See the name I chose.');
  check('and a link that names its own text is not resolved at all', asked, []);
}

{
  const { rendered, asked } = await render('See [[target]].', { target: 'The Other Note' });
  check('a bare target reads as the title of the document it names', rendered, 'See The Other Note.');
  check('which is one question to the workspace', asked, ['target']);
}

{
  const { rendered } = await render('See [[nowhere]].', {});
  check('and a target no document answers is written as itself', rendered, 'See nowhere.');
}

{
  const { rendered } = await render('See [[target]].', { target: '' });
  check('an empty title counts as no answer rather than as nothing to write', rendered, 'See target.');
}

{
  const { rendered, asked } = await render('[[a]] and [[a]] and [[b|b]].', { a: 'A' });
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
  const { rendered } = await render(note, { target: 'The Other Note' });
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
  const { rendered } = await render('A fence only:\n\n```\n[[target]]\n```\n', { target: 'Nope' });
  check('and a wikilink that is a fence’s body is not a wikilink', rendered, 'A fence only:\n\n```\n[[target]]\n```\n');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('export: all checks passed');
