/**
 * Checks labeled display-math syntax and environment lowering.
 *
 * One bracketed display-math block is one equation source. The environment
 * analysis removes every native numbering layer so Yi can provide one
 * block-level number in the editor and every export.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-equation-blocks-'));
const bundle = await rolldown({
  input: 'src/ui/markdown/syntax/equation_blocks.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'equation_blocks.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const {
  equationsForParsers,
  innerEquationBody,
  latexEquationBody,
  readDisplayMath,
  readEquationBlock,
  readEquationBody,
  unnumberedEquationBody
} = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const source = '[$$\nx=1\n$$]{#eq:x .wide owner=demo}';
const block = readEquationBlock(source);
check('display-math wrapper identity', block?.id, 'eq:x');
check('display-math wrapper classes', block?.classes, ['wide']);
check('display-math wrapper attributes', block?.attributes, { owner: 'demo' });
check('display-math wrapper body', block?.math, 'x=1');
check('display-math wrapper source', block?.source, source);
check('display-math wrapper range', [block?.from, block?.to], [0, source.length]);
check('empty attributes are unlabeled', readEquationBlock('[$$\nx\n$$]{}')?.id, null);
check('opening attributes are not supported', readEquationBlock('$${#eq:x}\nx=1\n$$'), null);
check('prose before a wrapper is not one', readEquationBlock('before [$$\nx\n$$]{}'), null);
check('prose after attributes is not one', readEquationBlock('[$$\nx\n$$]{} after'), null);
check(
  'ordinary display math has its own body range',
  [readDisplayMath('$$\nx\n$$')?.math, readDisplayMath('$$\nx\n$$')?.mathFrom],
  ['x', 3]
);
check(
  'TeX braces do not hide the wrapper attributes',
  readEquationBlock('[$$\n\\begin{align}\nx&=1\\\\\ny&=2\n\\end{align}\n$$]{#eq:align .wide}')?.id,
  'eq:align'
);

const wrap = (name, argument = '') =>
  `\\begin{${name}}${argument}\nx\n\\end{${name}}`;
const matrix = [
  ['plain', 'x', 'x'],
  ['equation', wrap('equation'), 'x'],
  ['equation*', wrap('equation*'), 'x'],
  ['align', wrap('align'), '\\begin{aligned}\nx\n\\end{aligned}'],
  ['align*', wrap('align*'), '\\begin{aligned}\nx\n\\end{aligned}'],
  ['aligned', wrap('aligned'), wrap('aligned')],
  ['gather', wrap('gather'), '\\begin{gathered}\nx\n\\end{gathered}'],
  ['gather*', wrap('gather*'), '\\begin{gathered}\nx\n\\end{gathered}'],
  ['gathered', wrap('gathered'), wrap('gathered')],
  ['alignat', wrap('alignat', '{2}'), '\\begin{alignedat}{2}\nx\n\\end{alignedat}'],
  ['alignat*', wrap('alignat*', '{2}'), '\\begin{alignedat}{2}\nx\n\\end{alignedat}'],
  ['alignedat', wrap('alignedat', '{2}'), wrap('alignedat', '{2}')],
  ['split', wrap('split'), wrap('split')]
];

for (const [label, input, inner] of matrix) {
  const body = readEquationBody(input);
  check(`${label}: environment read`, body?.source, input);
  check(`${label}: labeled inner lowering`, innerEquationBody(body), inner);
}

const unnumbered = [
  ['equation', 'equation*'],
  ['align', 'align*'],
  ['gather', 'gather*'],
  ['alignat', 'alignat*']
];
for (const [name, starred] of unnumbered) {
  const argument = name === 'alignat' ? '{2}' : '';
  const body = readEquationBody(wrap(name, argument));
  check(
    `${name}: unlabeled numbering is suppressed`,
    unnumberedEquationBody(body),
    wrap(starred, argument)
  );
}
for (const name of ['equation*', 'align*', 'aligned', 'gather*', 'gathered', 'alignat*', 'alignedat', 'split']) {
  const argument = name.startsWith('alignat') || name === 'alignedat' ? '{2}' : '';
  const body = readEquationBody(wrap(name, argument));
  check(
    `${name}: an unnumbered body stays as written`,
    unnumberedEquationBody(body),
    wrap(name, argument)
  );
}

const align = readEquationBody(wrap('align'));
check(
  'LaTeX puts one equation around aligned rows',
  latexEquationBody(align, 'eq:system'),
  '\\begin{equation}\n\\begin{aligned}\nx\n\\end{aligned}\n\\label{eq:system}\n\\end{equation}'
);
check(
  'LaTeX wraps a plain body once',
  latexEquationBody(readEquationBody('x'), 'eq:plain'),
  '\\begin{equation}\nx\n\\label{eq:plain}\n\\end{equation}'
);

const parserInput =
  '[$$\nx\n$$]{#eq:x}\n\n' +
  '![After](after.png){#fig:after}\n';
const safeInput = equationsForParsers(parserInput);
check('parser input keeps every source offset', safeInput.length, parserInput.length);
check(
  'parser input leaves display math where the wrapper was',
  safeInput,
  ' $$\nx\n$$        \n\n![After](after.png){#fig:after}\n'
);
for (const [name, literal] of [
  ['fenced code', '```md\n[$$\nx\n$$]{#eq:x}\n```\n'],
  ['display math', '$$\n[$$\nx\n$$]{#eq:x}\n$$\n'],
  ['frontmatter', '---\nsample: |\n  [$$\n  x\n  $$]{#eq:x}\n---\n']
]) {
  check(
    `${name} keeps wrapper characters as literal source`,
    equationsForParsers(literal),
    literal
  );
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('equation blocks: all checks passed');
