/**
 * Checks the pure syntax of a caption line after a Markdown list.
 *
 * A list caption uses the table caption-line grammar but attaches only when its
 * indentation matches the list and no more than one blank line separates them.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-list-captions-'));
const bundle = await rolldown({
  input: 'src/ui/markdown/syntax/list_captions.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'list_captions.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { listCaptionAfterList, listCaptionLine } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const directSource =
  '- first\n- second\n: **Steps** {#list:steps .wide data-owner=demo}\n';
const directEnd = '- first\n- second'.length;
const direct = listCaptionAfterList(directSource, 0, directEnd);
check('a direct caption attaches', direct?.caption.caption, '**Steps**');
check(
  'its identity and attributes survive',
  [direct?.caption.id, direct?.caption.classes, direct?.caption.attributes],
  ['list:steps', ['wide'], { 'data-owner': 'demo' }]
);
check(
  'the direct caption has no separator',
  [direct?.separatorFrom, direct?.separatorTo],
  [null, null]
);
check(
  'the direct caption keeps absolute source ranges',
  [direct?.caption.captionFrom, direct?.caption.captionTo],
  [directEnd + 1, directSource.length - 1]
);

const separatedSource = '- item\n\n: Caption\n';
const separated = listCaptionAfterList(separatedSource, 0, '- item'.length);
check('one blank line still attaches', separated?.caption.caption, 'Caption');
check(
  'the separator range covers the blank line',
  [separated?.separatorFrom, separated?.separatorTo],
  ['- item'.length + 1, '- item'.length + 1]
);
check(
  'two blank lines do not attach',
  listCaptionAfterList('- item\n\n\n: Caption\n', 0, '- item'.length),
  null
);

const indentedSource = '  - item\n  : Caption\n';
check(
  'a caption at the list base indentation attaches',
  listCaptionAfterList(indentedSource, 0, '  - item'.length)?.caption.caption,
  'Caption'
);
check(
  'a caption at another indentation does not attach',
  listCaptionAfterList('  - item\n : Caption\n', 0, '  - item'.length),
  null
);

const onlyId = listCaptionLine(': {#list:steps}', 50);
check('an ID-only list caption is one', [onlyId?.caption, onlyId?.id], ['', 'list:steps']);
check('a caption-only line is one', listCaptionLine(': Steps', 0)?.id, null);
check('empty caption without an ID is not one', listCaptionLine(':   ', 0), null);
check('a bare colon is not one', listCaptionLine(':', 0), null);
check('a paragraph is not one', listCaptionLine('Steps', 0), null);
check(
  'malformed attributes remain caption text',
  listCaptionLine(': Steps {#list:id bare}', 0)?.caption,
  'Steps {#list:id bare}'
);
check(
  'inline Markdown remains in the caption',
  listCaptionLine(': **Steps** with `code`', 0)?.caption,
  '**Steps** with `code`'
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('list captions: all checks passed');
