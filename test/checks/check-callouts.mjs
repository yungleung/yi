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
  calloutAtOffset,
  calloutBodyInsertion,
  calloutHasBody,
  calloutKindEdit,
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
check(
  'a marker-only callout has no physical body line',
  calloutHasBody(readCallout('> [!NOTE]')),
  false
);
check(
  'an empty quoted body line belongs to the callout',
  calloutHasBody(readCallout('> [!NOTE]\n> ')),
  true
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

const nestedBeforeOuter = '> > [!TIP]\n> > Inner\n>\n> Outer after\n';
check(
  'a nested callout ends at a shallower outer quote line',
  readCallout(nestedBeforeOuter)?.to,
  nestedBeforeOuter.indexOf('\n>\n> Outer after')
);

const nestedAfterProse = '> Intro\n> > [!TIP]\n> > Inner\n';
check(
  'a nested callout is found after ordinary quoted prose',
  calloutAtOffset(nestedAfterProse, nestedAfterProse.indexOf('[!TIP]'))?.kind,
  'tip'
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

const warningDiv = '::: {.callout .callout-note #notice}\nBody\n:::\n';
check(
  'choosing a kind rewrites only the callout-kind class',
  calloutKindEdit(warningDiv, 'warning'),
  {
    from: '::: {.callout .'.length,
    to: '::: {.callout .callout-note'.length,
    replacement: 'callout-warning'
  }
);
const definitionDiv = '::: {.callout .callout-note}\nBody\n:::\n';
check(
  'choosing Definition creates the custom definition kind',
  calloutKindEdit(definitionDiv, 'definition'),
  {
    from: '::: {.callout .'.length,
    to: '::: {.callout .callout-note'.length,
    replacement: 'callout-definition'
  }
);
const bareDiv = ':::\nBody\n:::\n';
check('Default leaves a bare Div unchanged', calloutKindEdit(bareDiv, 'default'), null);
check(
  'choosing a callout turns a bare Div into that callout',
  calloutKindEdit(bareDiv, 'warning'),
  {
    from: 3,
    to: 3,
    replacement: ' {.callout .callout-warning}'
  }
);
check(
  'choosing Default removes the callout classes from a callout Div',
  calloutKindEdit(definitionDiv, 'default'),
  {
    from: 3,
    to: '::: {.callout .callout-note}'.length,
    replacement: ''
  }
);
const genericAttributes = '::: {.columns #layout}\nBody\n:::\n';
check(
  'choosing a callout keeps other classes and IDs on a generic Div',
  (() => {
    const edit = calloutKindEdit(genericAttributes, 'warning');
    return edit === null
      ? null
      : genericAttributes.slice(0, edit.from) +
          edit.replacement +
          genericAttributes.slice(edit.to);
  })(),
  '::: {.callout .callout-warning .columns #layout}\nBody\n:::\n'
);
const quotedClassAttribute =
  '::: {.callout .callout-tip title=".callout-note"}\nBody\n:::\n';
check(
  'a class-looking quoted value is not mistaken for the callout kind',
  calloutKindEdit(quotedClassAttribute, 'warning'),
  {
    from: '::: {.callout .'.length,
    to: '::: {.callout .callout-tip'.length,
    replacement: 'callout-warning'
  }
);
const nestedKindSource =
  '> [!NOTE]\n> ::: {.callout .callout-tip}\n> Inner\n> :::\n';
check(
  'choosing a kind edits the innermost Div inside a callout',
  calloutKindEdit(
    nestedKindSource,
    'warning',
    nestedKindSource.indexOf('Inner')
  ),
  {
    from: nestedKindSource.indexOf('.callout-tip') + 1,
    to: nestedKindSource.indexOf('.callout-tip') + '.callout-tip'.length,
    replacement: 'callout-warning'
  }
);

check('unknown marker is not a callout', readCallout('> [!CUSTOM]\n> text'), null);
check('suffix text is not a callout', readCallout('> [!NOTE] suffix\n> text'), null);
check('escaped marker is not a callout', readCallout('> \\[!NOTE]\n> text'), null);
check('ordinary quote is not a callout', readCallout('> ordinary quote'), null);
check(
  'the generated title wrapper is not a callout kind',
  readCallout('::: {.callout-title}\nTitle\n:::'),
  null
);
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
const unclosedDiv = '::: {.callout .callout-note}\nBody\n';
check('unclosed callout-like Div stays literal', calloutsForParsers(unclosedDiv), unclosedDiv);
const unclosedQuotedDiv = '> ::: {.callout .callout-note}\n> Body\n';
check(
  'unclosed quoted callout-like Div stays literal',
  calloutsForParsers(unclosedQuotedDiv),
  unclosedQuotedDiv
);
const unclosedOuterDiv =
  '::: {.callout .callout-note}\n' +
  ':::: {.callout .callout-tip}\n' +
  'Inner\n' +
  '::::\n';
check(
  'a nested close does not validate an unclosed outer callout',
  calloutsForParsers(unclosedOuterDiv),
  unclosedOuterDiv
);
const nestedGenericDiv =
  '::: {.callout .callout-note}\n' +
  ':::: {.warning}\n' +
  'Inner\n' +
  '::::\n' +
  ':::\n';
const nestedGenericParserInput = calloutsForParsers(nestedGenericDiv);
check(
  'a generic inner Div still contributes fence depth',
  nestedGenericParserInput.split('\n')[0].trimEnd(),
  ':::callout-note'
);
check(
  'the generic inner opening stays literal',
  nestedGenericParserInput.split('\n')[1],
  ':::: {.warning}'
);
const quotedClosingText = '::: {.callout-note}\n> :::\nBody\n';
check(
  'a quoted closer does not close a top-level Div',
  calloutsForParsers(quotedClosingText),
  quotedClosingText
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
