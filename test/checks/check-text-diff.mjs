/**
 * Two texts as one line stream (`services/text_diff.ts`) in Node: the whole document with what
 * changed marked — the equal ends trimmed only to compute the change, the middle diffed line by
 * line with removals before additions, and a change past the cap named rather than guessed at.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-text-diff-'));
const bundle = await rolldown({ input: 'src/services/text_diff.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'text_diff.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { textDiff } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
/** The stream as a reader sees it: ` ` a line that stayed, `-` one that went, `+` one that came. */
const read = (stream) =>
  stream
    .map((line) => `${line.kind === 'removed' ? '-' : line.kind === 'added' ? '+' : ' '}${line.text}`)
    .join('\n');
const diff = (before, after, cap = 200) => read(textDiff(before, after, cap));

check('a text against itself is all of it, unchanged', diff('a\nb\nc\n', 'a\nb\nc\n'), ' a\n b\n c');
check('a line added in the middle', diff('a\nb\nc\n', 'a\nb\nnew\nc\n'), ' a\n b\n+new\n c');
check('a line taken out', diff('a\nb\nc\n', 'a\nc\n'), ' a\n-b\n c');
check(
  'a line rewritten is the old one and the new one, in that order',
  diff('a\nold\nc\n', 'a\nnew\nc\n'),
  ' a\n-old\n+new\n c'
);
check('a text that was not there is all added', diff('', 'a\nb\n'), '+a\n+b');
check('and a text that is gone is all removed', diff('a\nb\n', ''), '-a\n-b');
check(
  'a trailing newline is not a line of its own',
  diff('a\nb', 'a\nb\n'),
  ' a\n b'
);
check(
  'a change past the cap is named rather than diffed',
  textDiff('a\n1\n2\n3\nz\n', 'a\n4\n5\n6\nz\n', 4).map((line) => ({
    kind: line.kind,
    text: line.text,
    replaced: line.replaced ?? null
  })),
  [
    { kind: 'same', text: 'a', replaced: null },
    { kind: 'removed', text: '', replaced: 3 },
    { kind: 'added', text: '', replaced: 3 },
    { kind: 'same', text: 'z', replaced: null }
  ]
);
check(
  'the unchanged ends are carried, not cut, however long',
  diff('one\ntwo\nthree\n', 'one\nTWO\nthree\n'),
  ' one\n-two\n+TWO\n three'
);
check(
  'and every line of both texts is in it exactly once',
  textDiff('a\nb\nc\nd\n', 'a\nx\nc\nd\n', 200).filter((line) => line.kind === 'same').length,
  3
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('text diff: all checks passed');
