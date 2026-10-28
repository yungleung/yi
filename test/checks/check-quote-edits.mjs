/**
 * Checks pure Enter and empty-body edits for quoted content.
 *
 * Quote breaks carry the full active `>` chain, double Enter removes exactly
 * one level, completed child blocks need one separator, and empty callouts
 * materialise their first body line without a navigation-time edit.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-quote-edits-'));
async function bundle(name, input) {
  const build = await rolldown({ input, logLevel: 'silent', platform: 'node' });
  const { output } = await build.generate({ format: 'esm' });
  await build.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return file;
}

const {
  enterInQuote,
  prefixInsertedLines
} = await import(await bundle('quote_edits', 'src/ui/markdown/syntax/quote_edits.ts'));
const { materializeCalloutBody } = await import(
  await bundle('callout_body', 'src/ui/markdown/syntax/callout_body.ts')
);
const { calloutBodyInsertion, readCallout } = await import(
  await bundle('callouts', 'src/ui/markdown/syntax/callouts.ts')
);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const paragraph = '> A line';
check(
  'paragraph Enter adds two quoted lines',
  enterInQuote(paragraph, paragraph.length, 1, 'paragraph'),
  {
    edit: { from: paragraph.length, to: paragraph.length, replacement: '\n>\n>' },
    caret: paragraph.length + 4
  }
);

const nestedBreak = '> > A line\n> >\n> >';
check(
  'second Enter pops one nested level',
  enterInQuote(nestedBreak, nestedBreak.length, 2, 'paragraph'),
  {
    edit: { from: 10, to: nestedBreak.length, replacement: '\n>\n>' },
    caret: 14
  }
);

check(
  'an empty quote at the start of a file never names a negative offset',
  enterInQuote('>', 1, 1, 'paragraph'),
  {
    edit: { from: 0, to: 1, replacement: '\n' },
    caret: 1
  }
);

const threeEmptyLines = '> A\n>\n>\n>';
check(
  'double Enter only unwraps the two lines made by one paragraph break',
  enterInQuote(threeEmptyLines, threeEmptyLines.length, 1, 'paragraph'),
  {
    edit: { from: 5, to: threeEmptyLines.length, replacement: '\n\n' },
    caret: 7
  }
);

const equationEnd = '> > $$\n> > x\n> > $$';
check(
  'completed child Enter adds one prefixed line',
  enterInQuote(equationEnd, equationEnd.length, 2, 'completed-child'),
  {
    edit: { from: equationEnd.length, to: equationEnd.length, replacement: '\n> >' },
    caret: equationEnd.length + 4
  }
);

check(
  'child insertion prefixes every physical line',
  prefixInsertedLines('> > ', 'one\ntwo'),
  '> > one\n> > two'
);

for (const context of ['list', 'table', 'code', 'equation']) {
  check(
    `${context} keeps its own Enter rule`,
    enterInQuote('> body', 6, 1, context),
    null
  );
}

const markerOnly = '> [!NOTE]';
check(
  'marker-only callout materialises a quoted body',
  materializeCalloutBody(markerOnly, 9, readCallout(markerOnly), 'Body'),
  {
    edit: { from: 9, to: 9, replacement: '\n> Body' },
    caret: 16
  }
);

const nestedMarkerOnly = '> > [!NOTE]';
check(
  'nested marker-only callout keeps its full prefix',
  materializeCalloutBody(
    nestedMarkerOnly,
    nestedMarkerOnly.length,
    readCallout(nestedMarkerOnly),
    'Body'
  ),
  {
    edit: {
      from: nestedMarkerOnly.length,
      to: nestedMarkerOnly.length,
      replacement: '\n> > Body'
    },
    caret: nestedMarkerOnly.length + 9
  }
);

const emptyDiv = '::: {.callout-note}\n:::\n';
check(
  'empty Div materialises a body line before its close',
  materializeCalloutBody(
    emptyDiv,
    emptyDiv.lastIndexOf(':::'),
    readCallout(emptyDiv),
    'Body'
  ),
  {
    edit: {
      from: emptyDiv.lastIndexOf(':::'),
      to: emptyDiv.lastIndexOf(':::'),
      replacement: 'Body\n'
    },
    caret: emptyDiv.lastIndexOf(':::') + 4
  }
);

const quotedDiv = '> ::: {.callout-note}\n> :::\n';
const quotedOuter = readCallout(quotedDiv);
check(
  'multiline text in an empty quoted Div prefixes every physical line',
  materializeCalloutBody(
    quotedDiv,
    calloutBodyInsertion(quotedOuter),
    quotedOuter,
    'one\ntwo'
  ),
  {
    edit: {
      from: 24,
      to: 24,
      replacement: 'one\n> two\n'
    },
    caret: 33
  }
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('quote edits: all checks passed');
