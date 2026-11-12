/**
 * Portable picture destinations for a LaTeX source export.
 *
 * Pandoc is handed the file the page resolved, but a source folder must not carry that absolute path.
 * A package-owned picture keeps its package-relative path and travels with the package assets; any
 * other local picture is copied under a generated bundle beside the `.tex`.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-latex-images-'));
const bundle = await rolldown({
  input: 'src/ui/export/assets/latex_images.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const entry = output.find((chunk) => chunk.type === 'chunk');
const file = join(directory, entry.fileName);
writeFileSync(file, entry.code);
const { portableLatexImage } = await import(pathToFileURL(file).href);

const failures = [];
const check = (name, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push({ name, actual, expected });
  }
};
const image = (destination, resolved, options = {}) =>
  portableLatexImage({
    destination,
    resolved,
    outputPath: options.outputPath ?? '/out/paper.tex',
    packageRoot: options.packageRoot ?? null,
    packageAssets: options.packageAssets ?? [],
    targets: options.targets ?? new Map()
  });

const packageImage = image(
  'figures/spectrum.pdf',
  '/templates/prl/figures/spectrum.pdf',
  { packageRoot: '/templates/prl' }
);
check('a package picture keeps the path its template wrote', packageImage, {
  path: 'figures/spectrum.pdf',
  asset: null
});
check(
  'a note picture copied over the package asset keeps that source-tree path',
  image('figures/spectrum.pdf', '/notes/figures/spectrum.pdf', {
    packageAssets: ['figures/spectrum.pdf']
  }),
  {
    path: 'figures/spectrum.pdf',
    asset: { source: '/notes/figures/spectrum.pdf', target: 'figures/spectrum.pdf' }
  }
);

const localImage = image('images/photo.png', '/notes/images/photo.png');
check('a note picture travels under the output bundle', localImage, {
  path: 'paper.assets/images/photo.png',
  asset: { source: '/notes/images/photo.png', target: 'paper.assets/images/photo.png' }
});

const punctuatedName = image('a b#c%.png', '/notes/a b#c%.png');
check('URL punctuation in a local picture name stays part of the file name', punctuatedName, {
  path: 'paper.assets/a b#c%.png',
  asset: { source: '/notes/a b#c%.png', target: 'paper.assets/a b#c%.png' }
});

const targets = new Map();
const first = image('/photos/a/photo.png', '/notes/a/photo.png', { targets });
const second = image('/photos/b/photo.png', '/notes/b/photo.png', { targets });
check('two source pictures with one name get distinct output names', [first, second], [
  {
    path: 'paper.assets/photo.png',
    asset: { source: '/notes/a/photo.png', target: 'paper.assets/photo.png' }
  },
  {
    path: 'paper.assets/2-photo.png',
    asset: { source: '/notes/b/photo.png', target: 'paper.assets/2-photo.png' }
  }
]);
const again = image('/photos/other.png', '/notes/a/photo.png', { targets });
check('the same source picture is copied once', again, {
  path: 'paper.assets/photo.png',
  asset: null
});

const absolute = image('/tmp/shot.png', '/tmp/shot.png');
check('an absolute picture name is reduced to a portable relative path', absolute, {
  path: 'paper.assets/shot.png',
  asset: { source: '/tmp/shot.png', target: 'paper.assets/shot.png' }
});

const climbing = image('../pictures/shot.png', '/notes/pictures/shot.png');
check('a destination that climbs does not keep the climb', climbing, {
  path: 'paper.assets/shot.png',
  asset: { source: '/notes/pictures/shot.png', target: 'paper.assets/shot.png' }
});

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`${failure.name}\n  expected ${JSON.stringify(failure.expected)}\n  actual   ${JSON.stringify(failure.actual)}`);
  }
  process.exit(1);
}
console.log('latex images: all checks passed');
