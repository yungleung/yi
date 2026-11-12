/**
 * Checks generic Pandoc Div source ranges and their container line edits.
 *
 * May import: the real syntax modules in Node. Upholds: generic Divs use the
 * same body and quoted-line rules as callout Divs.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-fenced-divs-'));
async function bundle(input, name) {
  const build = await rolldown({ input, logLevel: 'silent', platform: 'node' });
  const { output } = await build.generate({ format: 'esm' });
  await build.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return import(pathToFileURL(file).href);
}

const { fencedDivAtOffset, fencedDivNewline, readFencedDiv } = await bundle(
  'src/ui/markdown/syntax/container/index.ts',
  'container'
);
const {
  emptyCalloutNewline: emptyDivNewline,
  materializeFencedDivBody
} = await bundle(
  'src/ui/markdown/syntax/callout/body.ts',
  'callout_body'
);
const { hasGenericFencedDiv } = await bundle(
  'src/ui/markdown/syntax/callout/index.ts',
  'callouts'
);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const generic = '::: {.columns}\nLeft\n\nRight\n:::\n';
const div = readFencedDiv(generic);
check('a generic Div is read', div !== null, true);
check('and its opening range is exact', generic.slice(div?.markerFrom, div?.markerTo), '::: {.columns}');
check('and its body starts at the first body line', div?.bodyFrom, '::: {.columns}\n'.length);
check('and its body ends at the closing fence', generic.slice(div?.bodyFrom, div?.bodyTo), 'Left\n\nRight\n');
check(
  'the innermost generic Div is found at a body offset',
  fencedDivAtOffset(generic, generic.indexOf('Right'))?.from,
  0
);
check('an unclosed generic Div is not a Div block', readFencedDiv('::: {.columns}\nBody\n'), null);
check(
  'a quoted generic Div keeps its carrier',
  readFencedDiv('> ::: {.notes}\n> Note\n> :::\n')?.quotePrefix,
  '> '
);
const nestedInCallout =
  '::: {.callout .callout-note}\n\n::::\n\n::::\n\n:::\n';
const innerAt = nestedInCallout.indexOf('::::') + 5;
check(
  'a bare nested Div does not end its outer Div early',
  readFencedDiv(nestedInCallout)?.to,
  nestedInCallout.trimEnd().length
);
check(
  'the innermost bare Div is found inside a callout',
  fencedDivAtOffset(nestedInCallout, innerAt)?.fenceLength,
  4
);
const codeInDiv = '::: {.columns}\n```text\n:::\n```\nAfter\n:::\n';
check(
  'a colon fence inside code does not end its containing Div',
  readFencedDiv(codeInDiv)?.to,
  codeInDiv.trimEnd().length
);
const repeatedCodeFence = '::: {.columns}\n```text\n:::\n:::\n```\nAfter\n:::\n';
check(
  'a caret on colon code still belongs to the containing Div',
  fencedDivAtOffset(
    repeatedCodeFence,
    repeatedCodeFence.indexOf(':::\n', 4)
  )?.from,
  0
);
const quotedCode = '> ```text\n> :::\n> :::\n> ```\n';
check(
  'colon fences inside quoted code are not generic Divs',
  hasGenericFencedDiv(quotedCode),
  false
);

const newlineAt = generic.indexOf('Left') + 'Left'.length;
const newline = fencedDivNewline(generic, newlineAt);
check('Enter in a generic Div body adds one line', newline?.edit, {
  from: newlineAt,
  to: newlineAt,
  replacement: '\n'
});
check('with the caret on that line', newline?.caret, newlineAt + 1);
const list = '::: {.incremental}\n- One\n:::\n';
check(
  'a list item inside a generic Div is left to the list rule',
  fencedDivNewline(list, list.indexOf('One') + 'One'.length),
  null
);

const quoted = '> ::: {.notes}\n> Note\n> :::\n';
const quotedAt = quoted.indexOf('Note') + 'Note'.length;
check('a quoted generic Div adds its carrier on Enter', fencedDivNewline(quoted, quotedAt)?.edit, {
  from: quotedAt,
  to: quotedAt,
  replacement: '\n> '
});

const empty = ':::\n:::\n';
check('Enter opens the body of an empty generic Div', emptyDivNewline(empty, 4)?.edit, {
  from: 3,
  to: 3,
  replacement: '\n'
});
check(
  'and the callout helper is the same generic-Div helper',
  emptyDivNewline(empty, 4)?.edit.replacement,
  '\n'
);
check(
  'the first character materializes an empty generic Div body',
  materializeFencedDivBody(empty, 4, readFencedDiv(empty), 'X')?.edit,
  { from: 4, to: 4, replacement: 'X\n' }
);
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('fenced Divs: all checks passed');
