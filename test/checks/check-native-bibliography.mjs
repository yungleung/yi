/**
 * The bibliography a native-BibTeX LaTeX package receives.
 *
 * The package opts in through its own Pandoc defaults: `filters: []` turns citeproc off, and
 * `bibliography: references.bib` names the portable file its template cites. This check holds the
 * three rules that make that source useful: only citation syntax in the Markdown is read, only the
 * works those keys name are kept, and BibTeX or CSL-JSON both arrive as a deterministic `.bib`.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-native-bibliography-'));
const bundle = await rolldown({
  input: 'src/ui/export/reference/native_bibliography.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
for (const chunk of output) {
  if (chunk.type === 'chunk') {
    writeFileSync(join(directory, chunk.fileName), chunk.code);
  }
}
const entry = output.find((chunk) => chunk.type === 'chunk' && chunk.isEntry);
const file = join(directory, entry.fileName);
const { citedKeys, nativeBibliographyTarget, packageCitedBibliography } = await import(file);

const failures = [];
const check = (name, pass, actual = null) => {
  if (!pass) failures.push({ name, actual });
};

check(
  'a defaults file opts in with an empty filter list and one BibTeX target',
  nativeBibliographyTarget('filters: []\nbibliography: references.bib\n') === 'references.bib',
  nativeBibliographyTarget('filters: []\nbibliography: references.bib\n')
);
check(
  'other package filters keep the native bibliography path available',
  nativeBibliographyTarget(
    'filters:\n  - tools/revtex-table.lua\nbibliography: references.bib\n'
  ) === 'references.bib'
);
check(
  'a list target keeps its relative path',
  nativeBibliographyTarget('filters: []\nbibliography:\n  - refs/main.bib\n') ===
    'refs/main.bib',
  nativeBibliographyTarget('filters: []\nbibliography:\n  - refs/main.bib\n')
);
check(
  'citeproc keeps the existing export path',
  nativeBibliographyTarget(
    'filters:\n  - type: citeproc\nbibliography: references.bib\n'
  ) === null
);
check(
  'no filter list means the app default still applies',
  nativeBibliographyTarget('bibliography: references.bib\n') === null
);
check(
  'a target that could leave the output folder is refused',
  nativeBibliographyTarget('filters: []\nbibliography: ../outside.bib\n') === null
);
check(
  'a drive-qualified target is not a portable source path',
  nativeBibliographyTarget('filters: []\nbibliography: C:/outside.bib\n') === null
);

const markdown = `---
title: A paper
---

# Introduction

Cited [@penzias1965], again [@penzias1965], and [see @fixsen2009, p. 4].

\`[@inCode]\`

\`\`\`text
[@inFence]
\`\`\`
`;
check(
  'citations are read once each, in first-citation order',
  JSON.stringify(citedKeys(markdown)) === JSON.stringify(['penzias1965', 'fixsen2009']),
  citedKeys(markdown)
);

const bibtex = `
@article{penzias1965,
  author = {Penzias, Arno A. and Wilson, Robert W.},
  title = {A Measurement of Excess Antenna Temperature at 4080 Mc/s},
  journal = {Astrophysical Journal},
  year = {1965}
}

@article{undited1970,
  author = {Uncited, Author},
  title = {This work was not cited},
  journal = {Nowhere},
  year = {1970}
}

@article{fixsen2009,
  author = {Fixsen, Dale J.},
  title = {The Temperature of the Cosmic Microwave Background},
  journal = {Astrophysical Journal},
  year = {2009}
}
`;
const filteredBibtex = packageCitedBibliography(bibtex, ['penzias1965', 'fixsen2009']);
check(
  'a BibTeX library keeps exactly the cited entries',
  filteredBibtex.text.includes('penzias1965') &&
    filteredBibtex.text.includes('fixsen2009') &&
    !filteredBibtex.text.includes('undited1970') &&
    filteredBibtex.text.match(/@article\{penzias1965/g)?.length === 1,
  filteredBibtex
);
check(
  'and reports no missing keys',
  filteredBibtex.missing.length === 0,
  filteredBibtex.missing
);

const cslJson = JSON.stringify([
  {
    id: 'zotero-penzias',
    'citation-key': 'penzias1965',
    type: 'article-journal',
    title: 'A Measurement of Excess Antenna Temperature at 4080 Mc/s',
    author: [{ family: 'Penzias', given: 'Arno A.' }],
    issued: { 'date-parts': [[1965]] }
  },
  {
    id: 'fixsen2009',
    type: 'article-journal',
    title: 'The Temperature of the Cosmic Microwave Background',
    author: [{ family: 'Fixsen', given: 'Dale J.' }],
    issued: { 'date-parts': [[2009]] }
  },
  {
    id: 'uncited1970',
    type: 'article-journal',
    title: 'This work was not cited',
    author: [{ family: 'Uncited', given: 'Author' }],
    issued: { 'date-parts': [[1970]] }
  }
]);
const converted = packageCitedBibliography(cslJson, ['penzias1965', 'fixsen2009', 'missing']);
check(
  'CSL-JSON uses citation-key first and id second, and becomes BibTeX',
  converted.text.includes('@article{penzias1965') &&
    converted.text.includes('@article{fixsen2009') &&
    !converted.text.includes('uncited1970') &&
    !converted.text.includes('zotero-penzias'),
  converted
);
check(
  'a cited key the library does not hold is named',
  JSON.stringify(converted.missing) === JSON.stringify(['missing']),
  converted.missing
);
check(
  'nothing cited writes an empty bibliography',
  packageCitedBibliography(cslJson, []).text === '',
  packageCitedBibliography(cslJson, [])
);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`${failure.name}\n  actual ${JSON.stringify(failure.actual)}`);
  }
  process.exit(1);
}
console.log('native bibliography: all checks passed');
