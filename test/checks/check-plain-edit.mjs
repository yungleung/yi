/**
 * Checks the rule the fast path trusts: an edit it accepts must not change how
 * the text parses. The rule may fall back as often as it likes; it may not be
 * wrong.
 *
 * "How the text parses" means the editor's own pipeline (`syntax/parser.ts`), not a
 * stand-in: the plugins and repairs are what make a `:` a description list at a line's
 * beginning, a `$` math, a `[[` a wikilink and a `www.` an autolink.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-plain-edit-'));
/**
 * Bundles one module with rolldown for Node and imports it, the way every check does.
 * The platform matters here: the browser build of `decode-named-character-reference`
 * decodes an entity by making a DOM element, and a document with `&amp;` in it would
 * throw inside this check rather than parse.
 */
const load = async (input, name) => {
  const bundle = await rolldown({ input, logLevel: 'silent', platform: 'node' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return await import(file);
};
const { isPlainEdit } = await load('src/ui/markdown/syntax/plain_edit.ts', 'plain_edit');
const { nodeShape } = await load('src/ui/markdown/syntax/node_shape.ts', 'node_shape');
// The parse reaches `decode-named-character-reference`, whose bundled build makes an
// element at import time; `check-history.mjs` installs the same stub before it
// bundles this module.
globalThis.document = {
  addEventListener() {},
  createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {}, setAttribute() {} }),
  querySelectorAll: () => [],
  querySelector: () => null,
  createRange: () => ({})
};
globalThis.window = { getSelection: () => null, addEventListener() {} };

const { parseMarkdown } = await load('src/ui/markdown/syntax/parser.ts', 'parser');
const { MarkdownEditorState } = await load('src/ui/markdown/document/state.ts', 'state');

const shape = (text) => nodeShape(parseMarkdown(text).children);

/** Every node of the block an offset sits in, with the source it covers. */
const nodesOf = (state, offset) => {
  const block = state.getBlockAtOffset(offset);
  if (!block) {
    return null;
  }
  const list = [];
  const walk = (nodes, path) => {
    for (const node of nodes) {
      const start = block.charStart + (node.position?.start?.offset ?? 0);
      const end = block.charStart + (node.position?.end?.offset ?? 0);
      list.push({
        path: `${path}>${node.type}`,
        start,
        end,
        source: state.getText().slice(start, end)
      });
      if (Array.isArray(node.children)) {
        walk(node.children, `${path}>${node.type}`);
      }
    }
  };
  walk(state.getBlockContent(block), block.kind);
  return list;
};

/**
 * The property the fast path trusts: the new parse is the old one with the edit
 * applied where it lands. Node types are what the renderer draws and a node's source
 * is what it holds, so comparing both catches what types alone cannot — a link whose
 * *extent* changed (`seehttps://x` → `see https://x`) has the same types. A node the
 * edit never reached keeps the source it had; a boundary offset belongs to one leaf
 * or the other, so a node satisfying either form is accepted.
 */
const derivable = (before, after, from, to, inserted) => {
  const one = nodesOf(new MarkdownEditorState(before), from);
  const other = nodesOf(new MarkdownEditorState(after), from + inserted.length);
  if (!one || !other || one.length !== other.length) {
    return false;
  }
  for (let index = 0; index < one.length; index += 1) {
    if (one[index].path !== other[index].path) {
      return false;
    }
    const applied =
      one[index].start <= from && from <= one[index].end
        ? one[index].source.slice(0, from - one[index].start) +
          inserted +
          one[index].source.slice(from - one[index].start + (to - from))
        : null;
    if (other[index].source !== one[index].source && other[index].source !== applied) {
      return false;
    }
  }
  return true;
};

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

// The rule accepts ordinary typing...
check('a letter inside a word is plain', isPlainEdit('a quick fox', 3, 3, 'x'), true);
check('a letter replacing a letter is plain', isPlainEdit('a quick fox', 2, 3, 'u'), true);
check('a deletion inside a word is plain', isPlainEdit('a quick fox', 2, 3, ''), true);
check('a run of letters is plain', isPlainEdit('a quick fox', 3, 3, 'very'), true);
check('a single space is plain', isPlainEdit('a quick fox', 3, 3, ' '), true);
check('deleting the space between two words is plain', isPlainEdit('two words', 3, 4, ''), true);
check('a space inside a URL is not plain',
  isPlainEdit('see https://example.com now', 15, 15, ' '), false);
check('a space before a glued URL is not plain',
  isPlainEdit('seehttps://x.example', 3, 3, ' '), false);
check('a second space in a row is not plain', isPlainEdit('a  b', 2, 2, ' '), false);
// ...and the punctuation of a sentence, which is the phase's point: a marker is what
// can change how the text reads, and none of these is one.
check('a full stop is plain', isPlainEdit('a quick fox', 3, 3, '.'), true);
check('a full stop inside a word is plain', isPlainEdit('a quick fox', 4, 4, '.'), true);
check('a comma is plain', isPlainEdit('a quick fox', 3, 3, ','), true);
check('a colon is plain', isPlainEdit('a quick fox', 4, 4, ':'), true);
check('a semicolon is plain', isPlainEdit('a quick fox', 4, 4, ';'), true);
check('an apostrophe is plain', isPlainEdit('dont stop', 4, 4, "'"), true);
check('a quote is plain', isPlainEdit('a quick fox', 3, 3, '"'), true);
check('a question mark is plain', isPlainEdit('a quick fox', 4, 4, '?'), true);
check('an exclamation mark is plain', isPlainEdit('a quick fox', 4, 4, '!'), true);
check('a hyphen inside a word is plain', isPlainEdit('well known', 4, 4, '-'), true);
check('a digit is plain', isPlainEdit('a quick fox', 3, 3, '1'), true);
check('a date is plain', isPlainEdit('on 1 January', 4, 4, '2'), true);
check('a period after a digit mid-line is plain', isPlainEdit('see item 1 now', 10, 10, '.'), true);
check('deleting a comma is plain', isPlainEdit('one, two', 3, 4, ''), true);

// ...and refuses everything that could change structure.
check('an asterisk is not plain', isPlainEdit('a quick fox', 3, 3, '*'), false);
check('a backtick is not plain', isPlainEdit('a quick fox', 3, 3, '`'), false);
check('a backslash is not plain', isPlainEdit('a quick fox', 3, 3, '\\'), false);
check('a bracket is not plain', isPlainEdit('a quick fox', 3, 3, '['), false);
check('an at sign is not plain', isPlainEdit('a quick fox', 3, 3, '@'), false);
check('a slash is not plain', isPlainEdit('a quick fox', 3, 3, '/'), false);
check('an equals sign is not plain', isPlainEdit('a quick fox', 3, 3, '='), false);
check('a newline is not plain', isPlainEdit('a quick fox', 3, 3, '\n'), false);
check('a tab is not plain', isPlainEdit('a quick fox', 3, 3, '\t'), false);
check('typing beside a marker is not plain', isPlainEdit('*a*quick fox', 3, 3, 'x'), false);
check('deleting a marker is not plain', isPlainEdit('*a* quick fox', 1, 2, ''), false);
check('typing at a line start is not plain', isPlainEdit('a\nquick fox', 2, 2, 'x'), false);
check('typing at a line end is not plain', isPlainEdit('a\nquick fox', 1, 1, 'x'), false);
check('typing above a setext underline is not plain', isPlainEdit('title\n---\n', 3, 3, 'x'), false);
check('typing above a setext equals line is not plain', isPlainEdit('title\n===\n', 3, 3, 'x'), false);
check('an edit spanning a line edge is not plain', isPlainEdit('a\nquick fox', 1, 3, 'x'), false);
// The line's own beginning: a marker is a few characters, and one typed character can
// finish it — `1 x` is prose until the `.` arrives, `-x` is not a list once it has a
// letter, and a table's delimiter row is not a row once it has a full stop.
check('a full stop after a digit at a line start is not plain',
  isPlainEdit('1 x', 1, 1, '.'), false);
check('a paren after a digit at a line start is not plain',
  isPlainEdit('1 x', 1, 1, ')'), false);
check('a letter after a bullet is not plain', isPlainEdit('- well', 1, 1, 'x'), false);
check('a space after a bullet is not plain', isPlainEdit('-x well', 1, 1, ' '), false);
check('a full stop in a delimiter row is not plain',
  isPlainEdit('| a | b |\n| --- | --- |\n', 19, 19, '.'), false);
check('a full stop inside an indent is not plain',
  isPlainEdit('x\n\n    code\n', 4, 4, '.'), false);
// A marker already there and past its space is different: the caret is in the content.
check('typing at the start of a list item`s text is plain',
  isPlainEdit('- item', 2, 2, 'x'), true);
check('typing at the start of a heading`s text is plain',
  isPlainEdit('## item', 3, 3, 'x'), true);
check('typing at the start of a quote`s text is plain',
  isPlainEdit('> item', 2, 2, '.'), true);
check('typing at the start of a detail`s text is plain',
  isPlainEdit(': item', 2, 2, ','), true);
// The autolink a run of plain characters can spell, on both sides of the edit.
check('a full stop inside a www run is not plain', isPlainEdit('see wwwx now', 7, 7, '.'), false);
check('deleting a character out of a www run is not plain',
  isPlainEdit('see www.example now', 7, 9, ''), false);
check('deleting the character before a www run is not plain',
  isPlainEdit('see www.example now', 3, 5, "'"), false);
check('typing beside a www run is not plain', isPlainEdit('see www.x now', 8, 8, 'y'), false);
check('typing inside a www run is not plain',
  isPlainEdit('see www.example now', 9, 9, 'y'), false);
// Two spaces: the render turns the second into a no-break space, and the two at the end
// of a line are a hard break — including the one an edit straddles.
check('a full stop and a space before a trailing space is not plain',
  isPlainEdit('ax, \n', 3, 3, '. '), false);
check('a space before a trailing space is not plain', isPlainEdit('ax \n', 2, 2, ' '), false);
check('a character between the two spaces of a hard break is not plain',
  isPlainEdit('one two  \n', 8, 8, 'x'), false);
check('deleting one of the two spaces of a hard break is not plain',
  isPlainEdit('one two  \n', 8, 9, ''), false);
check('and a line holding a hard break is not plain at all',
  isPlainEdit('one two  \n', 7, 7, 'x'), false);
check('but a line with one trailing space still is', isPlainEdit('one two \n', 7, 7, 'x'), true);

// The property: whatever the rule accepts must parse to the same shape.
const documents = [
  'a quick fox\n\nsecond paragraph\n',
  '# heading\n\n- one\n- two\n\n> quote\n',
  'text with *emphasis* and `code` and [a link](https://example.com)\n',
  'the quick brown fox jumps over the lazy dog and keeps running through the field\n',
  '| a | b |\n| --- | --- |\n| 1 | 2 |\n',
  'term\n\n: detail\n\n```js\nconst x = 1;\n```\n',
  'Body[^1]\n\n[^1]: note\n',
  '中文段落，裡面有一些文字。\n\n第二段。\n',
  'see https://example.com and seehttps://glued.example now\n',
  'a link to [the title](https://example.com/dest) and [t](<the dest>)\n',
  'a double  space, a footnote label [^label] and its definition\n\n[^label]: note\n',
  'term\n: detail with a comma, and a full stop.\n\nanother term\n: another detail\n',
  'a term with ~~struck~~ and an entity &amp; in it\n: a detail with @smith2020 in it\n',
  '1. one\n2. two\n\n3) three\n\n10. ten\n',
  'a paragraph that wraps\nonto a second line, and a third\n\ntitle\n---\n',
  'see www.example.org and example.com and https://example.com now\n',
  '| Item | Cost |\n| --- | ---: |\n| tea | 1.50 |\n',
  '---\ntitle: x\n...\n\nbody\n',
  'x\n\n    indented code\n\n- item\n  - nested\n\nprice is $5, 5% off; 5.5 total\n'
];
/**
 * Three walks per document: one that types ordinary letters, one that types the
 * punctuation of a sentence — which the rule accepts, and which is where a rule that
 * does not know what a `:` or a `.` can do would be wrong — and one that types the
 * characters that can change a parse, which is where it is most likely to be wrong.
 */
const walks = [
  ['a', 'b', 'e', 'o', 'x', '中'],
  ['a', 'o', 'x', ' ', '.', ',', '-', ':', "'", '1', '5'],
  ['a', 'x', '中', '*', '`', '[', '\n', '-', ':', '1', ' ']
];
let seed = 20260923;
const nextRandom = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
let accepted = 0;
for (const alphabet of walks) {
  for (const start of documents) {
    let text = start;
    for (let step = 0; step < 120; step += 1) {
      const from = Math.floor(nextRandom() * (text.length + 1));
      const to = Math.min(text.length, from + Math.floor(nextRandom() * 3));
      let inserted = '';
      const size = Math.floor(nextRandom() * 3);
      for (let index = 0; index < size; index += 1) {
        inserted += alphabet[Math.floor(nextRandom() * alphabet.length)];
      }
      const before = text;
      const after = `${before.slice(0, from)}${inserted}${before.slice(to)}`;
      if (isPlainEdit(before, from, to, inserted)) {
        accepted += 1;
        const one = shape(before);
        const other = shape(after);
        if (one !== other) {
          failures.push(
            `the rule accepted an edit that changed the parse\n  before ${JSON.stringify(before)}\n` +
              `  edit ${JSON.stringify({ from, to, inserted })}\n  after ${JSON.stringify(after)}\n` +
              `  ${one}\n  ${other}`
          );
        }
        // ...and the tree it parses to has to be that same tree, with this edit in
        // the one leaf it lands in. Types alone cannot say that: a link whose extent
        // changed has the same types.
        if (!derivable(before, after, from, to, inserted)) {
          failures.push(
            `the rule accepted an edit that is not the parse with that edit in it\n` +
              `  before ${JSON.stringify(before)}\n  edit ${JSON.stringify({ from, to, inserted })}\n` +
              `  after ${JSON.stringify(after)}`
          );
        }
      }
      text = after;
    }
  }
}
check('the rule accepts real typing, not nothing', accepted > 50, true);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`plain edit: all checks passed (${accepted} accepted edits)`);
