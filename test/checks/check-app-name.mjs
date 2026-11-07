/**
 * Keeps the product identity aligned across npm, Cargo, Tauri and the MIT licence.
 *
 * The packaged app reads `CFBundleName`, but an unbundled dev process falls back
 * to the executable's name. Tauri derives the executable from Cargo's main binary,
 * so the product name, default run target and binary target must agree. The same
 * author and licence travel into the native About panel through Cargo metadata.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const npm = JSON.parse(readFileSync('package.json', 'utf8'));
const licence = readFileSync('LICENSE', 'utf8');
const metadata = spawnSync(
  'cargo',
  ['metadata', '--manifest-path', 'src-tauri/Cargo.toml', '--no-deps', '--format-version', '1'],
  { encoding: 'utf8' }
);

if (metadata.status !== 0) {
  console.error(metadata.stderr || 'cargo metadata failed');
  process.exit(1);
}

const cargo = JSON.parse(metadata.stdout);
const manifestPath = new URL('../../src-tauri/Cargo.toml', import.meta.url).pathname;
const pkg = cargo.packages.find((candidate) => candidate.manifest_path === manifestPath);
const binaries = pkg.targets
  .filter((target) => target.kind.includes('bin'))
  .map((target) => target.name);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

check('Tauri names the product Yi', config.productName, 'Yi');
check('Cargo runs the product binary by default', pkg.default_run, config.productName);
check('the product binary exists', binaries.includes(config.productName), true);
check('no lowercase binary shadows the product name', binaries.includes(config.productName.toLowerCase()), false);
check('npm names the author', npm.author, 'yungleung');
check('npm declares the licence', npm.license, 'MIT');
check('Cargo names the author', pkg.authors, ['yungleung']);
check('Cargo declares the licence', pkg.license, 'MIT');
check('Tauri uses the author identity in its bundle identifier', config.identifier, 'com.yungleung.yi');
check('the MIT licence names the copyright holder', licence.includes('Copyright (c) 2026 yungleung'), true);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('app identity: product, author and MIT licence metadata agree');
