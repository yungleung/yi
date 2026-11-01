/**
 * Checks the pure syntax of a Pandoc table caption line.
 *
 * A caption begins with `:` and separation whitespace, contains inline
 * Markdown, and may end in one Pandoc attribute block. Invalid attributes stay
 * caption text and create no target.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-table-captions-'));
const bundle = await rolldown({
  input: 'src/ui/markdown/syntax/table/captions.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'captions.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { isTableCaptionLine, tableCaptionLine } = await import(file);

const parserBundle = await rolldown({
  input: 'src/ui/markdown/syntax/parser.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output: parserOutput } = await parserBundle.generate({ format: 'esm' });
await parserBundle.close();
const parserFile = join(directory, 'parser.mjs');
writeFileSync(parserFile, parserOutput.find((chunk) => chunk.type === 'chunk').code);
const { parseMarkdown, serializeMarkdown } = await import(parserFile);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const source = ': Results {#tbl:results .margin data-owner=demo}';
const caption = tableCaptionLine(source, 100);
check('caption', caption?.caption, 'Results');
check('identity and attributes', [
  caption?.id,
  caption?.classes,
  caption?.attributes
], ['tbl:results', ['margin'], { 'data-owner': 'demo' }]);
check('source spelling', caption?.attribute?.source, '{#tbl:results .margin data-owner=demo}');
check('absolute line range', [caption?.captionFrom, caption?.captionTo], [100, 148]);
check('absolute text range', [caption?.textFrom, caption?.textTo], [102, 109]);

const onlyId = tableCaptionLine(': {#tbl:id}', 0);
check('an ID-only caption is one', [onlyId?.caption, onlyId?.id], ['', 'tbl:id']);
check('a caption-only line is one', tableCaptionLine(': Unlabelled', 0)?.id, null);
check('empty caption without an ID is not one', tableCaptionLine(':   ', 0), null);
check('a paragraph is not a caption', tableCaptionLine('Caption', 0), null);
check('a bare colon is not a caption', tableCaptionLine(':', 0), null);
check('isTableCaptionLine agrees', isTableCaptionLine(': Unlabelled'), true);
check(
  'malformed attributes stay caption text',
  tableCaptionLine(': Results {#tbl:id bare}', 0)?.caption,
  'Results {#tbl:id bare}'
);
check(
  'malformed attributes create no target',
  tableCaptionLine(': Results {#tbl:id bare}', 0)?.id,
  null
);
check(
  'inline Markdown stays in the caption',
  tableCaptionLine(': *Results* with `code`', 0)?.caption,
  '*Results* with `code`'
);

const direct = parseMarkdown('| A |\n| --- |\n| 1 |\n: Results {#tbl:x .margin}\n');
check('a direct caption is not a table row', direct.children[0]?.children?.length, 2);
check(
  'a direct caption is its own node after the table',
  direct.children.map((node) => node.type),
  ['table']
);
check('the direct caption keeps its ID', direct.children[0]?.tableCaption?.id, 'tbl:x');
check(
  'the direct caption keeps inline Markdown',
  direct.children[0]?.tableCaption?.children?.[0]?.value,
  'Results'
);
check(
  'the direct form serializes exactly',
  serializeMarkdown(direct),
  '| A |\n| --- |\n| 1 |\n: Results {#tbl:x .margin}\n'
);

const separated = parseMarkdown('| A |\n| --- |\n| 1 |\n\n: Results {#tbl:x}\n');
check(
  'one blank line still attaches the caption',
  separated.children.map((node) => node.type),
  ['table']
);
check('the separated caption is attached', separated.children[0]?.tableCaption?.id, 'tbl:x');
check(
  'the separated form serializes exactly',
  serializeMarkdown(separated),
  '| A |\n| --- |\n| 1 |\n\n: Results {#tbl:x}\n'
);

const distant = parseMarkdown('| A |\n| --- |\n| 1 |\n\n\n: Not a caption\n');
check(
  'two blank lines do not attach',
  distant.children[0]?.tableCaption ?? null,
  null
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('table captions: all checks passed');
