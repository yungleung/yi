/**
 * Checks the list commands in Node: what the three list buttons do to a line
 * or a selection, and what one indent step moves.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

const bundle = await rolldown({ input: 'src/ui/markdown/syntax/list_edits.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-list-'));
const file = join(directory, 'list_edits.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { listEdit, indentEdit, readMarker } = await import(file);

/** How deep the lists of a document nest, per the markdown parser itself. */
const nestingDepth = (markdown) => {
  const tree = unified().use(remarkParse).use(remarkGfm).runSync(
    unified().use(remarkParse).use(remarkGfm).parse(markdown)
  );
  const walk = (node, depth) =>
    (node.children ?? []).reduce(
      (best, child) =>
        child.type === 'list' ? Math.max(best, walk(child, depth + 1)) : Math.max(best, walk(child, depth)),
      depth
    );
  return walk(tree, 0);
};

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
const applied = (text, edit) =>
  edit === null ? null : text.slice(0, edit.from) + edit.replacement + text.slice(edit.to);
const whole = (text) => ({ from: 0, to: text.length });

// A plain line becomes each kind of item, and the item's own text is kept.
check('a paragraph becomes a bullet', applied('text', listEdit('text', 0, 4, 'bullet')), '- text');
check('a paragraph becomes an ordered item', applied('text', listEdit('text', 0, 4, 'ordered')), '1. text');
check('a paragraph becomes a task', applied('text', listEdit('text', 0, 4, 'task')), '- [ ] text');

// The same kind turns the item back into a plain line.
check('a bullet toggles off', applied('- text', listEdit('- text', 0, 6, 'bullet')), 'text');
check('an ordered item toggles off', applied('3. text', listEdit('3. text', 0, 7, 'ordered')), 'text');
check('a task toggles off, checkbox and all', applied('- [x] text', listEdit('- [x] text', 0, 10, 'task')), 'text');

// Another kind is rewritten, keeping indentation and content.
check('a bullet becomes ordered', applied('- text', listEdit('- text', 0, 6, 'ordered')), '1. text');
check('an ordered item becomes a task', applied('7) text', listEdit('7) text', 0, 7, 'task')), '- [ ] text');
check('a task becomes a bullet, losing the checkbox', applied('- [ ] text', listEdit('- [ ] text', 0, 10, 'bullet')), '- text');
check('indentation is kept', applied('  - text', listEdit('  - text', 0, 8, 'ordered')), '  1. text');

// An ordered item continues the one above it.
const list = '1. one\n2. two\n';
check('an ordered item continues the list above', applied('1. one\ntext', listEdit('1. one\ntext', 7, 11, 'ordered')), '1. one\n2. text');
check('an ordered item at another indent starts at 1', applied('1. one\n  text', listEdit('1. one\n  text', 7, 11, 'ordered')), '1. one\n  1. text');

// A selection: every line is rewritten in one edit, numbered in order.
check(
  'a selection of paragraphs becomes one list',
  applied('one\ntwo\nthree', listEdit('one\ntwo\nthree', 0, 13, 'ordered')),
  '1. one\n2. two\n3. three'
);
check(
  'a selection of mixed items becomes one kind',
  applied('- one\n2. two', listEdit('- one\n2. two', 0, 12, 'bullet')),
  '- one\n- two'
);
check(
  'a blank line in a selection is not given a marker',
  applied('one\n\ntwo', listEdit('one\n\ntwo', 0, 8, 'bullet')),
  '- one\n\n- two'
);
check(
  'a selection ending where a line starts does not touch that line',
  applied('one\ntwo', listEdit('one\ntwo', 0, 4, 'bullet')),
  '- one\ntwo'
);
check(
  'a selection that is already one kind toggles off',
  applied('- one\n- two', listEdit('- one\n- two', 0, 12, 'bullet')),
  'one\ntwo'
);
check('a blank line alone has nothing to toggle', listEdit('one\n\n', 4, 5, 'bullet'), null);

// Indentation moves an item and the children it owns.
check('indent adds one step', applied('- a', indentEdit('- a', 0, 3, false)), '  - a');
check('outdent takes one step away', applied('  - a', indentEdit('  - a', 0, 5, true)), '- a');
check('outdent on an unindented item does nothing', indentEdit('- a', 0, 3, true), null);
check('a non-list line does not indent', indentEdit('text', 0, 4, false), null);
check(
  'indent moves the children with the item',
  applied('- a\n  - b\n- c', indentEdit('- a\n  - b\n- c', 0, 2, false)),
  '  - a\n    - b\n- c'
);
check(
  'a selection of a parent and its child indents once',
  applied('- a\n  - b', indentEdit('- a\n  - b', 0, 9, false)),
  '  - a\n    - b'
);
check(
  'outdent moves the children too',
  applied('- a\n  - b', indentEdit('- a\n  - b', 8, 9, true)),
  '- a\n- b'
);
check(
  'a selection of two items indents both',
  applied('- a\n- b', indentEdit('- a\n- b', 0, 7, false)),
  '  - a\n  - b'
);

// Nesting is decided by the markdown parser, so these ask it directly: an
// indented item has to be a *child* item of the one above, not text under it.
check(
  'indenting an ordered item nests it, and numbers it as a nested list starts',
  applied('1. one\n2. two', indentEdit('1. one\n2. two', 10, 11, false)),
  '1. one\n   1. two'
);
check(
  'the indented ordered item is really nested',
  nestingDepth(applied('1. one\n2. two', indentEdit('1. one\n2. two', 10, 11, false))) > 1,
  true
);
check(
  'the old flat step would not have nested',
  nestingDepth('1. one\n  2. two') > 1,
  false
);
check(
  'a two-digit marker nests its child at its own column',
  applied('10. one\n11. two', indentEdit('10. one\n11. two', 11, 12, false)),
  '10. one\n    1. two'
);
check(
  'indenting a task item nests it',
  applied('- [ ] a\n- [ ] b', indentEdit('- [ ] a\n- [ ] b', 11, 12, false)),
  '- [ ] a\n  - [ ] b'
);
check(
  'the nested task item is a child item',
  nestingDepth(applied('- [ ] a\n- [ ] b', indentEdit('- [ ] a\n- [ ] b', 11, 12, false))) > 1,
  true
);
check(
  'indenting into an existing nested list continues its numbering',
  applied('1. a\n   1. b\n2. c', indentEdit('1. a\n   1. b\n2. c', 18, 19, false)),
  '1. a\n   1. b\n   2. c'
);
check(
  'outdenting an ordered item renumbers it at its parent level',
  applied('1. a\n   1. b\n   2. c', indentEdit('1. a\n   1. b\n   2. c', 17, 18, true)),
  '1. a\n   1. b\n2. c'
);
check(
  'outdenting keeps the nesting that remains',
  nestingDepth(applied('1. a\n   1. b\n   2. c', indentEdit('1. a\n   1. b\n   2. c', 17, 18, true))),
  2
);

// Reading a marker.
check('a marker is read apart', readMarker('  - [x] item'), {
  indent: '  ',
  bullet: '-',
  kind: 'task',
  number: null,
  length: 8,
  column: 4
});
check('an ordered marker keeps its number', readMarker('12) item')?.number, 12);
check('plain text has no marker', readMarker('text'), null);
check('a bullet without a space is not a marker', readMarker('-'), null);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('list edits: all checks passed');
