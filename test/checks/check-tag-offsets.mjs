/**
 * Says which of the offsets a block's elements carry an edit moves, and fails until
 * every one of them has been decided about.
 *
 * The tags inside a block are block-relative document offsets, and the plain-edit
 * fast path writes into one text node without rendering the block — so the tags
 * after the write have to move with the text (see `editing/typed_text.ts`). The bug
 * that list prevents: typing in an early word left every later tag three characters
 * short, and a caret clicked into a later word of the same block then landed three
 * characters early (`test/probes/typed-text.js` has the case). A new tag that is on
 * neither list is the same bug waiting to happen, which is what this check is for.
 *
 * It reads sources rather than bundling them: it is about which attributes exist and
 * which of them somebody has decided about, not about what they do.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = 'src/ui/markdown';
const movedBy = 'src/ui/markdown/editing/typed_text.ts';

/**
 * The tags an edit does not move, each with the reason it does not have to be on
 * the list the fast path shifts.
 */
const exempt = {
  lineStart: 'the block element’s own first line, re-tagged from the document on every sync',
  lineEnd: 'the block element’s own last line, re-tagged with `lineStart`',
  charStart: 'the block element’s own start, re-tagged with `lineStart`',
  contentStart: 'an offset within its own element’s text, which an edit elsewhere does not move',
  contentEnd: 'an offset within its own element’s text, like `contentStart`',
  tableCell: 'a cell’s name (`row:column`), not an offset',
  taskCheckbox: 'a flag, not an offset',
  footnoteRef: 'a footnote label, not an offset',
  footnoteDef: 'a footnote label, not an offset',
  math: 'the formula’s own source, kept as a value',
  display: 'the formula’s mode, a flag',
  lazyRendered: 'a flag, not an offset',
  virtualSpacer: '`top` or `bottom`, a name',
  findBar: 'find-bar UI state, not a document offset',
  findStatus: 'find-bar UI state, not a document offset',
  findReplaceActions: 'find-bar UI state, not a document offset',
  layout: 'which layout the editor is drawn in (`page` or `auto`), not a document offset'
};

const files = [];
(function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (path.endsWith('.ts')) {
      files.push(path);
    }
  }
})(root);
files.sort();

/** Every tag the editor writes, by the file that writes it. */
const written = new Map();
for (const file of files) {
  for (const match of readFileSync(file, 'utf8').matchAll(/dataset\.([A-Za-z]+)\s*=/g)) {
    const name = match[1];
    if (!written.has(name)) {
      written.set(name, []);
    }
    written.get(name).push(file);
  }
}

/** The tags the fast path moves, as its own source lists them. */
const fastPath = readFileSync(movedBy, 'utf8');
const list = /const OFFSET_TAGS = \[([\s\S]*?)\]/.exec(fastPath);
const moved = new Set(
  list === null
    ? []
    : list[1]
        .split(',')
        .map((entry) => entry.trim().replace(/^'|'$/g, ''))
        .filter(Boolean)
);

const failures = [];
if (list === null) {
  failures.push(`${movedBy}: no OFFSET_TAGS list to read`);
}
for (const [name, sources] of written) {
  if (moved.has(name) || name in exempt) {
    continue;
  }
  failures.push(
    `data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}${
      sources.length > 0 ? ` (${sources.join(', ')})` : ''
    }: is it an offset inside the block? An edit moves those — add it to ${movedBy}'s ` +
      'OFFSET_TAGS, or to the exempt list in this check with the reason it does not move'
  );
}
for (const name of moved) {
  if (!written.has(name)) {
    failures.push(`${movedBy}: moves data-${name}, which nothing writes`);
  }
  if (name in exempt) {
    failures.push(`${movedBy}: moves data-${name}, which this check calls exempt`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(
  `tag offsets: ${moved.size} moved with a write, ${Object.keys(exempt).length} exempt and accounted for`
);
