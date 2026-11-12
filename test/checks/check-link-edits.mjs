/**
 * Checks what a link is written as, in Node: the `[title](destination)` markdown, the
 * escaping each part needs, where the caret sits inside it — and, through the markdown
 * parser itself, that what was written reads back as the link it meant.
 *
 * The two destination rules are here as well, because they are the same fact from two
 * sides: which clipboard text may become a destination, and which href the app may hand
 * to the system browser (the preview card uses that one too).
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

const bundle = await rolldown({ input: 'src/ui/markdown/syntax/link_edits.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-link-edits-'));
const file = join(directory, 'link_edits.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const {
  linkInsertion,
  clipboardDestination,
  isOpenableUrl,
  isFilePath,
  isSameDocumentFragment
} = await import(pathToFileURL(file).href);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
/** The caret's place in a written link, as `[ti|tle](url)`. */
const withCaret = (insertion) =>
  `${insertion.markdown.slice(0, insertion.caret)}|${insertion.markdown.slice(insertion.caret)}`;
/** The inline nodes of the first paragraph `markdown` parses into. */
const inlines = (markdown) => {
  const processor = unified().use(remarkParse).use(remarkGfm);
  return processor.runSync(processor.parse(markdown)).children[0].children ?? [];
};
const textOf = (node) => (node.children ?? []).map((child) => child.value ?? '').join('');

// What is written, and where the caret lands in it.
const empty = linkInsertion('', 'https://example.com');
check('a link with no title yet is written empty', empty.markdown, '[](https://example.com)');
check('and the caret is between the brackets, ready to type', withCaret(empty), '[|](https://example.com)');
const titled = linkInsertion('Title', 'https://example.com');
check('a title already written goes in the brackets', titled.markdown, '[Title](https://example.com)');
check('and the caret lands at the end of it', withCaret(titled), '[Title|](https://example.com)');
check('a link with no destination is still written', linkInsertion('Title', null).markdown, '[Title]()');
check('and a blank destination is no destination', linkInsertion('Title', '   ').markdown, '[Title]()');
check('a bracket in the title is escaped', linkInsertion('a]b', 'u').markdown, '[a\\]b](u)');
check('and so is a backslash', linkInsertion('a\\b', 'u').markdown, '[a\\\\b](u)');

// The destination: plain when markdown can read it, `<…>` when it cannot.
check(
  'a path with balanced parentheses is written plainly',
  linkInsertion('x', 'https://en.wikipedia.org/wiki/Foo_(bar)').markdown,
  '[x](https://en.wikipedia.org/wiki/Foo_(bar))'
);
check(
  'an unclosed parenthesis is wrapped',
  linkInsertion('x', 'https://example.com/a)b').markdown,
  '[x](<https://example.com/a)b>)'
);
check('a space in the destination is wrapped', linkInsertion('x', 'https://a.example/b c').markdown, '[x](<https://a.example/b c>)');
check(
  'and an angle bracket inside a wrapped destination is escaped',
  linkInsertion('x', 'https://a.example/b>c d').markdown,
  '[x](<https://a.example/b\\>c d>)'
);

// What the parser reads back: the link it was meant to be.
const parsedEmpty = inlines(empty.markdown);
check('the parser reads an empty-titled link as a link', parsedEmpty.map((node) => node.type), ['link']);
check('with no text yet', textOf(parsedEmpty[0]), '');
check('and the destination it was written with', parsedEmpty[0].url, 'https://example.com');
const parsedParens = inlines(linkInsertion('', 'https://en.wikipedia.org/wiki/Foo_(bar)').markdown);
check(
  'a destination with parentheses comes back whole',
  parsedParens[0].url,
  'https://en.wikipedia.org/wiki/Foo_(bar)'
);
const parsedWrapped = inlines(linkInsertion('', 'https://example.com/a)b').markdown);
check('and a wrapped one comes back whole too', parsedWrapped[0].url, 'https://example.com/a)b');
const parsedEscaped = inlines(linkInsertion('a]b', 'https://example.com').markdown);
check('an escaped title renders as the title it was', textOf(parsedEscaped[0]), 'a]b');
check('and its destination survives', parsedEscaped[0].url, 'https://example.com');

// The clipboard rule.
check('an https URL is a destination', clipboardDestination(' https://example.com/x \n'), 'https://example.com/x');
check('an http URL is one', clipboardDestination('http://example.com'), 'http://example.com');
check('a mail link is one', clipboardDestination('mailto:someone@example.com'), 'mailto:someone@example.com');
check('a bare host is not', clipboardDestination('www.example.com'), null);
check('two lines are not', clipboardDestination('https://example.com\nsecond line'), null);
check('an unknown scheme is not', clipboardDestination('javascript:alert(1)'), null);
check('and an empty clipboard is not', clipboardDestination('   \n'), null);

// What the app may hand to the browser.
check(
  'the browser is handed an http(s) link',
  [isOpenableUrl('https://example.com'), isOpenableUrl('HTTP://example.com')],
  [true, true]
);
check(
  'and nothing else',
  [isOpenableUrl('mailto:a@b.c'), isOpenableUrl('#fragment'), isOpenableUrl('README.md'), isOpenableUrl('')],
  [false, false, false, false]
);

// What the app may open *inside* itself: a link to a note, which is the half the browser's rule
// does not cover.
check(
  'a path is a file the app may open',
  [isFilePath('notes/a.md'), isFilePath('./a.md'), isFilePath('../a.md'), isFilePath('/Users/me/a.md'), isFilePath('a.png')],
  [true, true, true, true, true]
);
check(
  'and a Windows drive letter is a path, not a scheme',
  [isFilePath('C:\\notes\\a.md'), isFilePath('C:/notes/a.md')],
  [true, true]
);
check(
  'a destination with a scheme is not a file',
  [isFilePath('https://example.com'), isFilePath('mailto:a@b.c'), isFilePath('data:text/plain,x'), isFilePath('javascript:alert(1)')],
  [false, false, false, false]
);
check(
  'nor is a place in this page, a host, or nothing',
  [isFilePath('#fragment'), isFilePath('//example.com/a.md'), isFilePath(''), isFilePath('   ')],
  [false, false, false, false]
);

check('a local fragment is a heading target', isSameDocumentFragment('#methods'), true);
check('an encoded local fragment is a heading target', isSameDocumentFragment('#C%20Methods'), true);
check('an external file fragment is not', isSameDocumentFragment('note.md#methods'), false);
check('an empty fragment is not a target', isSameDocumentFragment('#'), false);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('link edits: all checks passed');
