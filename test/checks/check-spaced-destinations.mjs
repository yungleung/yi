/**
 * Checks what the parser makes of an image or a link whose path has spaces in it.
 *
 * markdown's destination may not contain a space unless it is wrapped in `<…>`, so
 * `![shot](my shot.png)` and `[note](my note.md)` are paragraphs of literal text — not an image
 * and not a link — even though a reader writing a path means the file it names, and an editor that
 * is lenient about paths wrote it that way. The repair reads such a run as the node it names,
 * wherever it stands, and the characters around it stay the text they were; a path the author
 * escaped and one already wrapped in `<…>` are left exactly as they are.
 *
 * The repair is a pure function of the parse and the source, so it is asserted here;
 * `image-path-with-spaces.js` proves the same through the editor, the asset protocol and the two
 * folders an image may live in, and `link-cmd-click.js` holds the link half from the click side.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-image-paths-'));
/** Bundles one module with rolldown for Node and imports it. */
const load = async (input, name) => {
  const bundle = await rolldown({ input, logLevel: 'silent', platform: 'node' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return await import(file);
};

const { parseMarkdown } = await load('src/ui/markdown/syntax/parser.ts', 'parser');
const { nodeShape } = await load('src/ui/markdown/syntax/node_shape.ts', 'node_shape');

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

/** The parse's node types and nesting. */
const shape = (markdown) => nodeShape(parseMarkdown(markdown).children);

/** Every image in the tree: its path, title, alt text and the characters it stands for. */
const images = (markdown) => {
  const found = [];
  const walk = (node) => {
    if (node.type === 'image') {
      const from = node.position?.start?.offset;
      const to = node.position?.end?.offset;
      found.push({
        url: node.url,
        alt: node.alt,
        title: node.title ?? null,
        source: typeof from === 'number' && typeof to === 'number' ? markdown.slice(from, to) : null
      });
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  for (const child of parseMarkdown(markdown).children) {
    walk(child);
  }
  return found;
};

/** Every link in the tree: its path, and the words it shows. */
const links = (markdown) => {
  const found = [];
  const walk = (node) => {
    if (node.type === 'link') {
      found.push({ url: node.url, text: (node.children ?? []).map((child) => child.value ?? '').join('') });
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  for (const child of parseMarkdown(markdown).children) {
    walk(child);
  }
  return found;
};

/** The first link's field, or null when the line is not a link at all. */
const firstLink = (markdown, field) => links(markdown)[0]?.[field] ?? null;

/** The first image's field, or null when the line is not an image at all. */
const firstImage = (markdown, field) => images(markdown)[0]?.[field] ?? null;

// The line a reader writes: the file's own name, spaces and all.
check('an image whose path has spaces is an image', shape('![shot](my shot.png)\n'), 'paragraph(image)');
check('and the path is the file it names', firstImage('![shot](my shot.png)\n', 'url'), 'my shot.png');
check(
  'and its alt text is what stands between the brackets',
  firstImage('![My picture.png](My picture.png)\n', 'alt'),
  'My picture.png'
);
// A title after the path is the title, not part of the file's name.
check('a quoted title is a title', firstImage('![shot](my shot.png "shot")\n', 'title'), 'shot');
check('and the path still ends before it', firstImage('![shot](my shot.png "shot")\n', 'url'), 'my shot.png');

// Nothing else about the line changes: a path without spaces, one already wrapped in `<…>`, and
// a remote URL were all read before this repair and are read the same after it.
check('a path without spaces is still an image', firstImage('![shot](shot.png)\n', 'url'), 'shot.png');
check('a wrapped path is still an image', firstImage('![shot](<my shot.png>)\n', 'url'), 'my shot.png');
check(
  'a web URL is still an image',
  firstImage('![shot](https://example.com/a b.png)\n', 'url'),
  null
);
check(
  'and a URL without spaces is itself',
  firstImage('![shot](https://e.com/a.png)\n', 'url'),
  'https://e.com/a.png'
);

// A path with a space *inside a sentence* is left alone: where such a destination ends cannot be
// known, and guessing would swallow the words after it.
// The run is read wherever it stands — the `)` ends the path — and the words around it stay text,
// which is the shape two thirds of the reader's own images have.
check('a spaced path inside a sentence is read', shape('see ![shot](my shot.png) here\n'), 'paragraph(text,image,text)');
check('and the words around it are still the words', shape('![shot](my shot.png) and then some\n'), 'paragraph(image,text)');
check('and the run after prose is read too', shape('prose\n![shot](my shot.png)\n'), 'paragraph(text,image)');
check('a list item’s own line is read as well', firstImage('- ![shot](my shot.png)\n', 'url'), 'my shot.png');
check(
  'two of them in one line are two images',
  images('![a](x y.png) and ![b](p q.png)\n').map((image) => image.url),
  ['x y.png', 'p q.png']
);

// The image keeps the position it stood at, so the caret and every offset map as they did.
check(
  'the image covers the characters it was written as',
  firstImage('text\n\n![shot](my shot.png)\n', 'source'),
  '![shot](my shot.png)'
);
check(
  'a line after the image is untouched',
  shape('![shot](my shot.png)\n\nmore text\n'),
  'paragraph(image),paragraph(text)'
);

// What the author escaped is not this repair's to read, and neither is code: those characters are
// meant literally.
check('an escaped run stays text', shape('\\![shot](my shot.png)\n'), 'paragraph(text)');
check(
  'a run in an inline code span stays code',
  firstImage('`![shot](my shot.png)`\n', 'url'),
  null
);
check(
  'a run in a code block stays code',
  firstImage('```\n![shot](my shot.png)\n```\n', 'url'),
  null
);

// A link's destination is a path a reader writes too, and markdown refuses a space in it for the
// same reason: `[note](my note.md)` is a paragraph of that literal text, so the note it names is
// not linked at all.
check('a link whose path has spaces is a link', shape('[note](my note.md)\n'), 'paragraph(link(text))');
check('and the path is the file it names', firstLink('[note](my note.md)\n', 'url'), 'my note.md');
check('and its words are what stands between the brackets', firstLink('[my note](my note.md)\n', 'text'), 'my note');
check(
  'and the words around it stay text',
  shape('see [note](my note.md) here\n'),
  'paragraph(text,link(text),text)'
);
check('an escaped link stays text', shape('\\[note](my note.md)\n'), 'paragraph(text)');
check(
  'a link whose path spells the space as %20 is a link too, and keeps its path',
  firstLink('[other](my%20note.md)\n', 'url'),
  'my%20note.md'
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('spaced destinations: a path with spaces is read as the node it names');
