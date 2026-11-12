/**
 * Checks the generated LaTeX target and theorem headers.
 *
 * Native figure, table and listing counters follow the document's labels and
 * literal prefixes. Table, equation and list automatic references use portable
 * macros whose final numbers come from LaTeX. Theorem declarations come from the
 * same resolved vocabulary and options the editor and Pandoc filter read.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-reference-header-'));
const load = async (input, name) => {
  const bundle = await rolldown({ input, logLevel: 'silent', platform: 'node' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return await import(pathToFileURL(file).href);
};
const { referenceHeader } = await load(
  'src/ui/export/reference/header.ts',
  'header'
);
const { theoremHeader } = await load(
  'src/ui/export/reference/theorem_header.ts',
  'theorem_header'
);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

check('a note with no numbered targets emits no header', referenceHeader('# No targets\n'), '');
check('a note with no theorems emits no theorem header', theoremHeader('# No theorems\n'), '');

const theoremPreamble = theoremHeader([
  '---',
  'amsthm:',
  '  plain:',
  '    - Theorem:',
  '        - Lemma',
  '  definition:',
  '    - Definition',
  '  name_to_text:',
  '    Theorem: 定理',
  '    Lemma: 引理',
  '    proof: 证明',
  '---',
  '',
  '::: {#thm:one .Theorem}',
  'Body.',
  ':::',
  '',
  '::: proof',
  'Done.',
  ':::'
].join('\n'));
check(
  'the theorem preamble loads amsthm and declares the resolved environments',
  theoremPreamble.includes('\\usepackage{amsthm}') &&
    theoremPreamble.includes('\\theoremstyle{plain}') &&
    theoremPreamble.includes('\\newtheorem{Theorem}{定理}') &&
    theoremPreamble.includes('\\newtheorem{Lemma}[Theorem]{引理}') &&
    theoremPreamble.includes('\\newtheorem{Definition}{Definition}'),
  true
);
check(
  'the theorem preamble carries the proof name',
  theoremPreamble.includes('\\renewcommand{\\proofname}{证明}'),
  true
);
check(
  'a shared-counter parent declaration comes first',
  theoremPreamble.indexOf('\\newtheorem{Theorem}{定理}') <
    theoremPreamble.indexOf('\\newtheorem{Lemma}[Theorem]{引理}'),
  true
);

const customTheoremPreamble = theoremHeader([
  '---',
  'amsthm:',
  '  styles:',
  '    margin:',
  '      headfont: [italic, smallcaps]',
  '      bodyfont: normal',
  '      headpunct: ":"',
  '      headspace: newline',
  '  margin:',
  '    - Claim:',
  '        - Fact*',
  '  parent_counter:',
  '    Claim: section',
  '  swapnumbers: true',
  '  qed_symbol: "$\\\\blacksquare$"',
  '  name_to_text:',
  '    Claim: 主张',
  '---',
  '',
  '::: {.Claim}',
  'Body.',
  ':::'
].join('\n'));
check(
  'a custom style is a guarded fallback',
  customTheoremPreamble.includes('\\@ifundefined{th@margin}') &&
    customTheoremPreamble.indexOf('\\@ifundefined{th@margin}') <
      customTheoremPreamble.indexOf('\\newtheoremstyle{margin}'),
  true
);
check(
  'the environment still selects the template-owned style',
  customTheoremPreamble.includes('\\theoremstyle{margin}') &&
    customTheoremPreamble.includes('\\newtheorem{Claim}{主张}[section]'),
  true
);
check(
  'an unnumbered custom theorem and the upstream options survive',
  customTheoremPreamble.includes('\\newtheorem*{Fact}{Fact}') &&
    customTheoremPreamble.includes('\\swapnumbers') &&
    customTheoremPreamble.includes(
      '\\renewcommand{\\qedsymbol}{\\ensuremath{\\blacksquare}}'
    ),
  true
);

const builtInStylePreamble = theoremHeader([
  '---',
  'amsthm:',
  '  styles:',
  '    plain:',
  '      headfont: italic',
  '  plain:',
  '    - Theorem',
  '---',
  '',
  '::: {.Theorem}',
  'Body.',
  ':::'
].join('\n'));
check(
  'a built-in style can still be configured by the note',
  [
    builtInStylePreamble.includes(
      '\\newtheoremstyle{plain}{}{}{\\normalfont}{}{\\itshape}{.}{ }{}'
    ),
    !builtInStylePreamble.includes('\\@ifundefined{th@plain}')
  ],
  [true, true]
);

const tableHeader = referenceHeader(
  '---\n' +
    'reference-labels:\n' +
    '  table: Data table\n' +
    'reference-number-prefixes:\n' +
    '  table: "2-"\n' +
    '---\n\n' +
    '| A |\n' +
    '| --- |\n' +
    '| 1 |\n' +
    ': Results {#tbl:x}\n'
);
check(
  'the table word and literal prefix follow document metadata',
  tableHeader.includes(
    '\\AtBeginDocument{%\n' +
      '  \\renewcommand{\\tablename}{Data table}%\n' +
      '  \\renewcommand{\\thetable}{\\mbox{2-}\\arabic{table}}%\n' +
      '}'
  ),
  true
);
check(
  'the portable table reference goes through the native counter',
  tableHeader.includes(
    '\\providecommand{\\yiTableRef}[1]{%\n' +
      '  \\hyperref[#1]{\\tablename~\\ref*{#1}}%\n' +
      '}'
  ),
  true
);

const figureHeader = referenceHeader(
  '---\n' +
    'reference-labels:\n' +
    '  figure: Diagram\n' +
    'reference-number-prefixes:\n' +
    '  figure: "A-"\n' +
    '---\n\n' +
    '![Picture](one.png){#fig:one}\n'
);
check(
  'figure captions use their configured native counter',
  figureHeader.includes('\\renewcommand{\\figurename}{Diagram}%') &&
    figureHeader.includes('\\renewcommand{\\thefigure}{\\mbox{A-}\\arabic{figure}}%'),
  true
);

const listingHeader = referenceHeader(
  '---\n' +
    'reference-labels:\n' +
    '  listing: Code excerpt\n' +
    'reference-number-prefixes:\n' +
    '  listing: "B-"\n' +
    '---\n\n' +
    '```python {#lst:one}\nprint(1)\n```\n'
);
check(
  'listing captions override listings only when that package defines them',
  listingHeader.includes(
    '  \\ifdefined\\lstlistingname\n' +
      '    \\renewcommand{\\lstlistingname}{Code excerpt}%\n' +
      '  \\fi'
  ),
  true
);
check(
  'listing prefixes override the native counter only when it exists',
  listingHeader.includes(
    '  \\ifdefined\\thelstlisting\n' +
      '    \\renewcommand{\\thelstlisting}{\\mbox{B-}\\arabic{lstlisting}}%\n' +
      '  \\fi'
  ),
  true
);

const equationHeader = referenceHeader(
  '---\n' +
    'reference-labels:\n' +
    '  equation: Formula\n' +
    'reference-number-prefixes:\n' +
    '  equation: "C-"\n' +
    '---\n\n' +
    '[$$\nx=1\n$$]{#eq:x}\n'
);
check(
  'equation metadata reaches its own native counter',
  equationHeader.includes(
    '\\AtBeginDocument{%\n' +
      '  \\renewcommand{\\equationname}{Formula}%\n' +
      '  \\renewcommand{\\theequation}{\\mbox{C-}\\arabic{equation}}%\n' +
      '}'
  ),
  true
);
check(
  'the equation macro is generated only when an equation exists',
  [
    equationHeader.includes('\\providecommand{\\yiEquationRef}[1]'),
    equationHeader.includes('\\providecommand{\\yiTableRef}[1]')
  ],
  [true, false]
);

const listHeader = referenceHeader(
  '---\n' +
    'reference-labels:\n' +
    '  list: Procedure\n' +
    'reference-number-prefixes:\n' +
    '  list: "3-"\n' +
    '---\n\n' +
    '- first\n- second\n\n: Steps {#list:steps}\n'
);
check(
  'list metadata reaches its namespaced object counter',
  listHeader.includes(
    '\\@ifundefined{c@yilist}{\\newcounter{yilist}}{}\n' +
      '\\makeatother\n' +
      '\\providecommand{\\yiListNumber}{\\arabic{yilist}}\n' +
      '\\renewcommand{\\theyilist}{\\yiListNumber}\n' +
      '\\providecommand{\\yiListName}{List}\n' +
      '\\providecommand{\\yiListCounterSetup}{}\n' +
      '\\AtBeginDocument{%\n' +
      '  \\yiListCounterSetup\n' +
      '  \\renewcommand{\\yiListName}{Procedure}%\n' +
      '  \\renewcommand{\\theyilist}{\\mbox{3-}\\yiListNumber}%\n' +
      '}'
  ),
  true
);
check(
  'the list reference uses the native reference machinery',
  listHeader.includes(
    '\\providecommand{\\yiListRef}[1]{%\n' +
      '  \\hyperref[#1]{\\yiListName~\\ref*{#1}}%\n' +
      '}'
  ),
  true
);

check(
  'LaTeX syntax in a literal prefix is escaped',
  referenceHeader(
    '---\nreference-number-prefixes:\n  table: "A&B"\n---\n\n' +
      '| A |\n| --- |\n| 1 |\n: Results\n'
  ).includes('\\mbox{A\\&B}\\arabic{table}'),
  true
);
check(
  'a backslash in a literal prefix is an escaped text command',
  referenceHeader(
    '---\nreference-number-prefixes:\n  table: \'A\\B\'\n---\n\n' +
      '| A |\n| --- |\n| 1 |\n: Results\n'
  ).includes('\\mbox{A\\textbackslash{}B}\\arabic{table}'),
  true
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('reference header: all checks passed');
