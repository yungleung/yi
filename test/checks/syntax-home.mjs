/**
 * Says where each markdown-syntax fact belongs, and fails until they live there.
 *
 * The same rules — what opens a fence, what a `$$` line is, what a list marker
 * is, what starts a block — used to be written out in several modules, which is
 * how `check-enter.mjs` came to rot. After P1 they live in
 * `src/ui/markdown/syntax/markers.ts`, and no other module defines them.
 *
 * This check reads sources rather than bundling them: it is about where the code
 * is, not what it does.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const editorRoot = 'src/ui/markdown';
const markersFile = 'src/ui/markdown/syntax/markers.ts';
/** The facts, and the module each must have as its only home. */
const facts = [
  'openingFence',
  'closingFence',
  'frontmatterDelimiter',
  'htmlBlockTerminator',
  'listMarker',
  'listItemMarker',
  'isDelimiterLine',
  'startsBlock'
];

const files = [];
(function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (path.endsWith('.ts')) {
      files.push(path);
    }
  }
})(editorRoot);

const failures = [];
const check = (name, condition) => {
  if (!condition) {
    failures.push(name);
  }
};

check(`${markersFile} exists`, files.includes(markersFile));
const markers = files.includes(markersFile) ? readFileSync(markersFile, 'utf8') : '';

for (const fact of facts) {
  check(`${markersFile} exports ${fact}`, new RegExp(`export (?:function|const) ${fact}\\b`).test(markers));
}

// A fact defined anywhere else is a second home, whatever it is called there.
const definingPattern = (fact) =>
  new RegExp(`(?:^|\\n)\\s*(?:export )?(?:function|const) ${fact}\\b`, 'm');
for (const file of files) {
  if (file === markersFile) {
    continue;
  }
  const source = readFileSync(file, 'utf8');
  for (const fact of facts) {
    check(`${fact} is defined only in ${markersFile} (found in ${file})`, !definingPattern(fact).test(source));
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('syntax homes: all checks passed');
