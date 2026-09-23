/**
 * Checks the rule the fast path trusts: an edit it accepts must not change how
 * the text parses. The rule may fall back as often as it likes; it may not be
 * wrong.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

const directory = mkdtempSync(join(tmpdir(), 'yi-plain-edit-'));
/** Bundles one module with rolldown and imports it, the way every check does. */
const load = async (input, name) => {
  const bundle = await rolldown({ input, logLevel: 'silent' });
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

const { MarkdownEditorState } = await load('src/ui/markdown/document/state.ts', 'state');

const parser = unified().use(remarkParse).use(remarkGfm);
const shape = (text) => nodeShape(parser.parse(text).children);

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
check('a full stop is not plain', isPlainEdit('a quick fox', 3, 3, '.'), false);

// ...and refuses everything that could change structure.
check('an asterisk is not plain', isPlainEdit('a quick fox', 3, 3, '*'), false);
check('a backtick is not plain', isPlainEdit('a quick fox', 3, 3, '`'), false);
check('a backslash is not plain', isPlainEdit('a quick fox', 3, 3, '\\'), false);
check('a bracket is not plain', isPlainEdit('a quick fox', 3, 3, '['), false);
check('a digit is not plain', isPlainEdit('a quick fox', 3, 3, '1'), false);
check('a newline is not plain', isPlainEdit('a quick fox', 3, 3, '\n'), false);
check('a tab is not plain', isPlainEdit('a quick fox', 3, 3, '\t'), false);
check('typing beside a marker is not plain', isPlainEdit('*a*quick fox', 3, 3, 'x'), false);
check('deleting a marker is not plain', isPlainEdit('*a* quick fox', 1, 2, ''), false);
check('typing at a line start is not plain', isPlainEdit('a\nquick fox', 2, 2, 'x'), false);
check('typing at a line end is not plain', isPlainEdit('a\nquick fox', 1, 1, 'x'), false);
check('typing above a setext underline is not plain', isPlainEdit('title\n---\n', 3, 3, 'x'), false);
check('typing above a setext equals line is not plain', isPlainEdit('title\n===\n', 3, 3, 'x'), false);
check('an edit spanning a line edge is not plain', isPlainEdit('a\nquick fox', 1, 3, 'x'), false);

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
  'a double  space, a footnote label [^label] and its definition\n\n[^label]: note\n'
];
/**
 * Two walks per document: one that types ordinary letters (which is where the
 * accepted edits come from, and which must stay a large share of them), and one
 * that types the characters that can change a parse (which is where the rule is
 * most likely to be wrong).
 */
const walks = [
  ['a', 'b', 'e', 'o', 'x', '中'],
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
