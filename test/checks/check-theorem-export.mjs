/**
 * Checks the pinned pandoc-amsthm asset and, when Pandoc is installed, its
 * native LaTeX contract.
 *
 * Example: the same declared Theorem with a Chinese display name becomes
 * `\newtheorem{Theorem}{定理}`, while `@Thm:euler` becomes a named `\ref`.
 *
 * May import: Node's process/file APIs only. Upholds: the bundled bytes are the
 * reviewed v3.1.1 release, its licence travels with them, and the filter emits
 * the native environments Yi promises.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const filter = 'src-tauri/assets/export/amsthm.lua';
const licence = 'src-tauri/assets/export/amsthm.LICENSE';
const failures = [];
const check = (name, pass) => {
  if (!pass) failures.push(name);
};

check('the theorem filter is bundled', existsSync(filter));
check('its BSD licence is bundled', existsSync(licence));
if (existsSync(filter)) {
  const bytes = readFileSync(filter);
  check(
    'the filter is the pinned v3.1.1 release',
    createHash('sha256').update(bytes).digest('hex') ===
      '378623761044ea5dc8461506ed487c9380e69a67e86b619ecee298207beda4e5'
  );
  check(
    'the filter states its Pandoc floor',
    bytes.toString('utf8').includes('must_be_at_least "3.1.1"')
  );
}
if (existsSync(licence)) {
  check(
    'the licence is BSD-3-Clause',
    readFileSync(licence, 'utf8').includes('BSD 3-Clause License')
  );
}

const version = spawnSync('pandoc', ['--version'], { encoding: 'utf8' });
if (version.status === 0) {
  const input = [
    '---',
    'amsthm:',
    '  plain:',
    '    - Theorem:',
    '        - Lemma',
    '  name_to_text:',
    '    Theorem: 定理',
    '---',
    '',
    '::: {#thm:euler .Theorem info="Euler"}',
    'Body.',
    ':::',
    '',
    'See @Thm:euler.'
  ].join('\n');
  const converted = spawnSync(
    'pandoc',
    ['-L', filter, '-t', 'latex', '-s'],
    { input, encoding: 'utf8' }
  );
  check('the bundled filter converts with Pandoc', converted.status === 0);
  check(
    'the theorem declaration keeps the localized name',
    converted.stdout.includes('\\newtheorem{Theorem}{定理}')
  );
  check(
    'the block uses the native theorem environment and label',
    converted.stdout.includes('\\begin{Theorem}[Euler]\\label{thm:euler}')
  );
  check(
    'the temporary named reference resolves through LaTeX',
    converted.stdout.includes('定理~\\ref{thm:euler}')
  );
} else {
  console.log('theorem export: pandoc is unavailable, native conversion skipped');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('theorem export: all checks passed');
