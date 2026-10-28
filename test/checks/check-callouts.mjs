/**
 * Checks GitHub-style and fenced-Div callout source grammar.
 *
 * Both forms produce one source model with exact offsets. Parser preparation
 * preserves every source character's position so later callout restoration can
 * use the original source while bodies are parsed as normal Markdown.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-callouts-'));
const bundle = await rolldown({
  input: 'src/ui/markdown/syntax/callouts.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'callouts.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const {
  calloutBodyInsertion,
  calloutsForParsers,
  readCallout
} = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const direct = '> [!NOTE]\n> First paragraph.';
const directCallout = readCallout(direct);
check('direct marker kind', directCallout?.kind, 'note');
check('direct marker is built in', directCallout?.builtin, true);
check('direct marker title', directCallout?.title, 'Note');
check(
  'direct marker body',
  directCallout?.source.slice(directCallout.bodyFrom, directCallout.bodyTo),
  'First paragraph.'
);
check('direct marker body insertion', calloutBodyInsertion(directCallout), direct.indexOf('First'));
check(
  'a marker-only callout inserts after the marker',
  calloutBodyInsertion(readCallout('> [!NOTE]')),
  '> [!NOTE]'.length
);

const nested = '> > [!tip]\n> > First\n> >\n> > - item\n';
const nestedCallout = readCallout(nested);
check('nested quote depth', nestedCallout?.quoteDepth, 2);
check('nested quote prefix', nestedCallout?.quotePrefix, '> > ');
check(
  'nested body keeps one quote layer',
  nestedCallout?.source
    .slice(nestedCallout.bodyFrom, nestedCallout.bodyTo)
    .split('\n')[0],
  '> First'
);

const separated = '> [!WARNING]\n>\n> First\n>\n> Second\n';
const separatedCallout = readCallout(separated);
check(
  'a quoted separator after the marker is not body text',
  separatedCallout?.source.slice(separatedCallout.bodyFrom, separatedCallout.bodyTo)
    .split('\n')[0],
  'First'
);

const div =
  '::: {.callout .callout-definition #definition owner=demo title="Defined Term"}\n' +
  'A term.\n' +
  ':::';
const custom = readCallout(div);
check('div kind', custom?.kind, 'definition');
check('div kind is custom', custom?.builtin, false);
check('div title', custom?.title, 'Defined Term');
check('div id', custom?.id, 'definition');
check('div attributes', custom?.attributes, { owner: 'demo', title: 'Defined Term' });
check('div classes omit the callout carriers', custom?.classes, ['callout', 'callout-definition']);
check('div body insertion', calloutBodyInsertion(custom), div.indexOf('A term.'));
const emptyDiv = '::: {.callout-note}\n:::\n';
check(
  'an empty Div inserts before its closing fence',
  calloutBodyInsertion(readCallout(emptyDiv)),
  emptyDiv.lastIndexOf(':::')
);

const shorthand = '::: {.callout-important}\nBody\n:::\n';
check('a lone shorthand class is a callout', readCallout(shorthand)?.kind, 'important');

const indented = '   ::: {.callout-note}\n   Body\n   :::\n';
check('up to three leading spaces are accepted', readCallout(indented)?.kind, 'note');
check(
  'an indented Div transform keeps its indentation',
  calloutsForParsers(indented).split('\n')[0].trimEnd(),
  '   :::callout-note'
);

const generatedTitle = '::: {.callout-two_words}\nBody\n:::\n';
check(
  'a custom title is humanized without the UI locale',
  readCallout(generatedTitle)?.title,
  'Two Words'
);

const nestedDiv = '> ::: {.callout .callout-tip}\n> Inner\n> :::\n';
check('a fenced Div can sit inside a quote', readCallout(nestedDiv)?.form, 'div');
check('the quoted Div keeps its outer depth', readCallout(nestedDiv)?.quoteDepth, 1);
check(
  'the quoted Div body keeps its outer carrier',
  (() => {
    const callout = readCallout(nestedDiv);
    return callout?.source.slice(callout.bodyFrom, callout.bodyTo).trimEnd();
  })(),
  '> Inner'
);

check('unknown marker is not a callout', readCallout('> [!CUSTOM]\n> text'), null);
check('suffix text is not a callout', readCallout('> [!NOTE] suffix\n> text'), null);
check('escaped marker is not a callout', readCallout('> \\[!NOTE]\n> text'), null);
check('ordinary quote is not a callout', readCallout('> ordinary quote'), null);
check(
  'a lazy continuation prevents alert recognition',
  readCallout('> [!NOTE]\n> body\noutside\n'),
  null
);
check('an unclosed Div is not a callout', readCallout('::: {.callout-note}\nBody\n'), null);
check(
  'a quoted Div cannot leave its quote stack',
  readCallout('> ::: {.callout-note}\n> body\noutside\n> :::\n'),
  null
);
check(
  'a non-callout fenced Div is not a callout',
  readCallout('::: {.warning}\nBody\n:::\n'),
  null
);
check(
  'two callout kinds are ambiguous',
  readCallout('::: {.callout-note .callout-tip}\nBody\n:::\n'),
  null
);

const divInput =
  '::: {.callout .callout-note title="Note"}\n' +
  'Body\n' +
  ':::\n';
const divParserInput = calloutsForParsers(divInput);
check('parser input keeps every offset', divParserInput.length, divInput.length);
check(
  'parser input exposes a directive container',
  divParserInput.split('\n')[0].trimEnd(),
  ':::callout-note'
);
check(
  'parser input preserves the body and closing fence',
  divParserInput.slice(divInput.indexOf('\n')),
  divInput.slice(divInput.indexOf('\n'))
);

const quotedDiv = '> :::: {.callout .callout-tip title="Tip"}\n> Body\n> ::::\n';
const quotedParserInput = calloutsForParsers(quotedDiv);
check(
  'a quoted Div transform keeps its quote prefix',
  quotedParserInput.split('\n')[0].trimEnd(),
  '> ::::callout-tip'
);
check('a quoted Div transform keeps every offset', quotedParserInput.length, quotedDiv.length);

for (const [name, source] of [
  [
    'fenced code',
    '```md\n::: {.callout .callout-note}\nBody\n:::\n```\n'
  ],
  [
    'display math',
    '$$\n::: {.callout .callout-note}\nBody\n:::\n$$\n'
  ],
  [
    'frontmatter',
    '---\nsample: |\n  ::: {.callout .callout-note}\n  Body\n  :::\n---\n'
  ]
]) {
  check(`${name} keeps its Div syntax literal`, calloutsForParsers(source), source);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('callouts: all checks passed');
