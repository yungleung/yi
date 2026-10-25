/**
 * Checks the generated LaTeX header that gives native counters literal prefixes.
 *
 * The header is emitted only when at least one prefix is non-empty. It overrides
 * counters at document start so a template's own definitions cannot take over.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-reference-header-'));
const bundle = await rolldown({
  input: 'src/ui/export/reference_header.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'reference_header.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { referenceHeader } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const defaults = referenceHeader('---\ntitle: A\n---\n');
check(
  'default labels still replace template caption words',
  [
    defaults?.includes('\\renewcommand{\\figurename}{Figure}') ?? false,
    defaults?.includes('\\renewcommand{\\tablename}{Table}') ?? false,
    defaults?.includes('\\renewcommand{\\lstlistingname}{Listing}') ?? false
  ],
  [true, true, true]
);
check(
  'empty prefixes add no counter definitions',
  defaults?.includes('\\renewcommand{\\thefigure}') ?? false,
  false
);

const figureHeader = referenceHeader(
  '---\n' +
    'reference-number-prefixes:\n' +
    '  figure: "2-"\n' +
    '---\n' +
    '\n' +
    '![Picture](one.png)\n'
);
check(
  'a figure prefix overrides its native counter',
  figureHeader?.includes(
    '\\renewcommand{\\thefigure}{\\mbox{2-}\\arabic{figure}}'
  ) ?? false,
  true
);
check(
  'the header runs after template setup',
  figureHeader?.startsWith('\\AtBeginDocument{%') ?? false,
  true
);

const many = referenceHeader(
  '---\n' +
    'reference-number-prefixes:\n' +
    '  figure: "A_"\n' +
    '  table: "B%"\n' +
    '  equation: "C#"\n' +
    '  listing: "D-"\n' +
    '  list: "ignored"\n' +
    '---\n'
);
check(
  'all native counters receive escaped literal prefixes',
  [
    many?.includes('\\mbox{A\\_}\\arabic{figure}') ?? false,
    many?.includes('\\mbox{B\\%}\\arabic{table}') ?? false,
    many?.includes('\\mbox{C\\#}\\arabic{equation}') ?? false,
    many?.includes('\\mbox{D-}\\arabic{lstlisting}') ?? false,
    many?.includes('\\thelist') ?? false
  ],
  [true, true, true, true, false]
);
check(
  'the listing override exists only when listings defines its counter',
  many?.includes('\\ifdefined\\thelstlisting') ?? false,
  true
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('reference header: all checks passed');
