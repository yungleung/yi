/**
 * Builds circular public-site favicons from the existing application icon.
 *
 * Example: running this after `site/assets/icon.png` changes regenerates the
 * SVG mark, 64px browser fallback and 180px Apple touch icon together.
 */
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const icon = await readFile(new URL('site/assets/icon.png', root));
const source = icon.toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title">
  <title id="title">Yi</title>
  <defs>
    <clipPath id="circle">
      <circle cx="64" cy="64" r="59"/>
    </clipPath>
  </defs>
  <circle cx="64" cy="64" r="62" fill="#f7f3ea"/>
  <image href="data:image/png;base64,${source}" x="8" y="8" width="112" height="112"
    preserveAspectRatio="xMidYMid meet" clip-path="url(#circle)"/>
  <circle cx="64" cy="64" r="60" fill="none" stroke="#b14d2f" stroke-width="4"/>
</svg>
`;
const svgPath = new URL('site/assets/favicon.svg', root);
await writeFile(svgPath, svg);

for (const [name, size] of [
  ['favicon.png', 64],
  ['apple-touch-icon.png', 180]
]) {
  const output = new URL(`site/assets/${name}`, root);
  const converted = spawnSync(
    'rsvg-convert',
    ['-w', String(size), '-h', String(size), '-o', output.pathname, svgPath.pathname],
    { encoding: 'utf8' }
  );
  if (converted.status !== 0) {
    throw new Error(converted.stderr || `could not create ${name}`);
  }
}

console.log('site: built circular favicon.svg, favicon.png and apple-touch-icon.png');
