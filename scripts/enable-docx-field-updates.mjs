/**
 * Marks a Word reference document so Word updates fields when a document using it opens.
 *
 * Pandoc writes a DOCX table of contents as a field with an empty cached result. Without
 * `w:updateFields`, readers can open the exported file and see an empty contents control until
 * they update fields by hand. This script adds the standard update-on-open setting while leaving
 * the rest of the reference document byte-for-byte equivalent at the XML level.
 *
 * Run: node scripts/enable-docx-field-updates.mjs
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'test/fixtures/templates/examples/docx/reference.docx');
const work = mkdtempSync(join(tmpdir(), 'yi-docx-fields-'));

const run = (program, args, options = {}) => {
  const result = spawnSync(program, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${program} failed: ${result.stderr || result.stdout}`);
  }
  return result;
};

try {
  run('unzip', ['-q', target, '-d', work]);
  const settingsPath = join(work, 'word/settings.xml');
  const settings = readFileSync(settingsPath, 'utf8');
  const updateFields = '<w:updateFields w:val="true"/>';
  const withoutUpdates = settings.replace(/<w:updateFields\b[^>]*\/>/g, '');
  writeFileSync(
    settingsPath,
    withoutUpdates.includes('<w:rsids>')
      ? withoutUpdates.replace('<w:rsids>', `${updateFields}<w:rsids>`)
      : withoutUpdates.replace('</w:settings>', `${updateFields}</w:settings>`)
  );

  rmSync(target, { force: true });
  run('zip', ['-q', '-X', '-r', target, ...readdirSync(work)], { cwd: work });
} finally {
  rmSync(work, { recursive: true, force: true });
}
