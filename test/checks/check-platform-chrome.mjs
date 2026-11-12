/**
 * Keeps custom window chrome to macOS and assigns native menu fallbacks elsewhere.
 *
 * Example: Windows and Linux must not mount Yi's custom title bar, while macOS keeps it.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/ui/platform_chrome.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-platform-chrome-'));
const file = join(directory, 'platform-chrome.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { usesCustomTitleBar } = await import(pathToFileURL(file).href);
const main = readFileSync('src/main.ts', 'utf8');
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

const failures = [];
const check = (name, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`
    );
  }
};

check('macOS keeps the custom title bar', usesCustomTitleBar('macos'), true);
check('Windows uses its native title bar', usesCustomTitleBar('windows'), false);
check('Linux uses its native title bar', usesCustomTitleBar('linux'), false);
check(
  'the composition root decides the title bar through the platform rule',
  main.includes('usesCustomTitleBar(platformName)') &&
    main.includes('showTitleBar ? new TitleBar(platformName) : null'),
  true
);
check(
  'CI checks Node and Rust on every desktop platform',
  ['ubuntu-latest', 'macos-latest', 'windows-latest'].every((os) =>
    workflow.includes(os)
  ) && workflow.includes('cargo test --manifest-path src-tauri/Cargo.toml'),
  true
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('platform chrome: custom title bar is macOS-only');
