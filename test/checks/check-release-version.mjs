/**
 * Runs the release-version guard against small repository fixtures and checks
 * that only one exact v-prefixed version can reach the release workflow.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const guard = join(process.cwd(), 'scripts/check-release-version.mjs');
const failures = [];

function fixture(versions) {
  const root = mkdtempSync(join(tmpdir(), 'yi-release-version-'));
  mkdirSync(join(root, 'src-tauri'));
  mkdirSync(join(root, '.github', 'release-notes'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: versions.package }, null, 2));
  writeFileSync(
    join(root, 'src-tauri/Cargo.toml'),
    `[package]\nname = "yi"\nversion = "${versions.cargo}"\n`
  );
  writeFileSync(
    join(root, 'src-tauri/tauri.conf.json'),
    JSON.stringify({ version: versions.tauri }, null, 2)
  );
  writeFileSync(
    join(root, '.github', 'release-notes', 'v0.1.0.md'),
    '# Yi v0.1.0\n\nRelease details.\n'
  );
  return root;
}

function run(tag, versions = { package: '0.1.0', cargo: '0.1.0', tauri: '0.1.0' }) {
  return spawnSync(process.execPath, [guard, tag], {
    cwd: fixture(versions),
    encoding: 'utf8'
  });
}

function expectStatus(name, result, status) {
  if (result.status !== status) {
    failures.push(
      `${name}\n  expected exit ${status}, got ${result.status}\n  stdout: ${result.stdout.trim()}\n  stderr: ${result.stderr.trim()}`
    );
  }
}

expectStatus('matching-tag-passes', run('v0.1.0'), 0);
{
  const root = fixture({ package: '0.1.0', cargo: '0.1.0', tauri: '0.1.0' });
  rmSync(join(root, '.github', 'release-notes', 'v0.1.0.md'));
  const result = spawnSync(process.execPath, [guard, 'v0.1.0'], {
    cwd: root,
    encoding: 'utf8'
  });
  expectStatus('missing-release-notes-fails', result, 1);
}
{
  const root = fixture({ package: '0.1.0', cargo: '0.1.0', tauri: '0.1.0' });
  writeFileSync(join(root, '.github', 'release-notes', 'v0.1.0.md'), ' \n');
  const result = spawnSync(process.execPath, [guard, 'v0.1.0'], {
    cwd: root,
    encoding: 'utf8'
  });
  expectStatus('empty-release-notes-fails', result, 1);
}
expectStatus('missing-v-prefix-fails', run('0.1.0'), 1);
expectStatus(
  'mismatched-package-version-fails',
  run('v0.1.0', { package: '0.1.1', cargo: '0.1.0', tauri: '0.1.0' }),
  1
);
expectStatus(
  'mismatched-tauri-version-fails',
  run('v0.1.0', { package: '0.1.0', cargo: '0.1.0', tauri: '0.1.1' }),
  1
);
expectStatus(
  'mismatched-cargo-version-fails',
  run('v0.1.0', { package: '0.1.0', cargo: '0.1.1', tauri: '0.1.0' }),
  1
);
expectStatus('malformed-tag-fails', run('v0.1'), 1);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('release version: tag and all manifests must agree');
