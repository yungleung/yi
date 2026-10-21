/**
 * Every shipped Pandoc defaults file states the heading shift explicitly, and that shift is zero.
 *
 * `shift-heading-level-by` is Pandoc's template-facing heading adjustment. A shipped non-zero value
 * changes every note's first heading before any template sees it; the app's own body rules decide
 * heading levels, so the defaults must not add another shift.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const directory = 'src-tauri/assets/export';
const files = readdirSync(directory)
  .filter((name) => /^export\..+\.yaml$/.test(name))
  .sort();
const failures = [];
for (const name of files) {
  const text = readFileSync(join(directory, name), 'utf8');
  const matches = [...text.matchAll(/^shift-heading-level-by:\s*(-?\d+)\s*(?:#.*)?$/gm)];
  if (matches.length !== 1) {
    failures.push(`${name}: expected one shift-heading-level-by line, found ${matches.length}`);
  } else if (matches[0][1] !== '0') {
    failures.push(`${name}: shift-heading-level-by is ${matches[0][1]}, expected 0`);
  }
}
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`export defaults: ${files.length} files state shift-heading-level-by: 0`);
