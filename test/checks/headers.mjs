/**
 * Says what a module header must say, and fails until every module says it.
 *
 * The house shape is three things in one comment: what the module is for (one
 * sentence), what it may import (the layers, not the files), and the invariant it
 * upholds. Written down, they are how a reader — or an agent — orients from file
 * headers alone; unwritten, a module's contract lives in whoever last touched it.
 *
 * This check reads sources rather than bundling them: it is about what the files
 * say, and a declaration file (`mdast.d.ts`) is a module with a contract too. It
 * looks only at the first header block, so a module may keep its long prose below
 * the three lines.
 *
 * The shape, and what each line is for, is `docs/writing-comments.md`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = 'src/ui/markdown';
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
})(root);
files.sort();

const failures = [];
for (const file of files) {
  const header = /^\s*\/\*\*([\s\S]*?)\*\//.exec(readFileSync(file, 'utf8'));
  if (!header) {
    failures.push(`${file}: opens with no header comment`);
    continue;
  }
  const text = header[1];
  const opening =
    text
      .split('\n')
      .map((line) => line.replace(/^\s*\*?\s?/, ''))
      .filter(Boolean)[0] ?? '';
  const missing = [];
  if (!opening || /^(May import|Upholds):/.test(opening)) {
    missing.push('a sentence saying what it is for');
  }
  if (!text.includes('May import:')) {
    missing.push('May import:');
  }
  if (!text.includes('Upholds:')) {
    missing.push('Upholds:');
  }
  if (missing.length > 0) {
    failures.push(`${file}: no ${missing.join(', no ')}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  console.error(
    `\nheaders: ${failures.length} of ${files.length} modules — how to write one is ` +
      'docs/writing-comments.md, and the layers are in docs/architecture.md'
  );
  process.exit(1);
}
console.log(`headers: ${files.length} modules say what they are for, what they may import and what they uphold`);
