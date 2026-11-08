/**
 * Builds the 1280 by 640 social card used by GitHub and Open Graph previews.
 *
 * Example: `npm run site:social` combines the circular app mark, product copy
 * and real editor screenshot into `site/assets/social-preview.png`.
 */
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const icon = (await readFile(new URL('site/assets/icon.png', root))).toString('base64');
const screenshot = (
  await readFile(new URL('site/assets/screenshots/hero.webp', root))
).toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640">
  <title>Yi — local-first Markdown writing</title>
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#faf6ed"/>
      <stop offset="1" stop-color="#eee4d4"/>
    </linearGradient>
    <clipPath id="iconCircle"><circle cx="116" cy="102" r="42"/></clipPath>
    <clipPath id="shot"><rect x="646" y="106" width="570" height="356" rx="22"/></clipPath>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#2b2119" flood-opacity="0.18"/>
    </filter>
  </defs>

  <rect width="1280" height="640" fill="url(#paper)"/>
  <circle cx="1180" cy="42" r="210" fill="#b14d2f" opacity="0.07"/>
  <circle cx="510" cy="680" r="260" fill="#b14d2f" opacity="0.05"/>
  <path d="M66 660 C310 500 520 640 760 455 C940 315 1100 360 1280 250" fill="none" stroke="#b14d2f" stroke-width="2" opacity="0.16"/>

  <circle cx="116" cy="102" r="48" fill="#f7f3ea"/>
  <image href="data:image/png;base64,${icon}" x="76" y="62" width="80" height="80"
    preserveAspectRatio="xMidYMid meet" clip-path="url(#iconCircle)"/>
  <circle cx="116" cy="102" r="46" fill="none" stroke="#b14d2f" stroke-width="4"/>
  <text x="184" y="102" fill="#171714" font-family="Iowan Old Style, Palatino, Georgia, serif"
    font-size="38" font-weight="700">Yi</text>
  <text x="184" y="130" fill="#625f58" font-family="Avenir Next, Segoe UI, sans-serif"
    font-size="16" font-weight="700" letter-spacing="3">LOCAL-FIRST MARKDOWN</text>

  <text x="70" y="246" fill="#171714" font-family="Iowan Old Style, Palatino, Georgia, serif"
    font-size="56" font-weight="700">Write in the page.</text>
  <text x="70" y="310" fill="#171714" font-family="Iowan Old Style, Palatino, Georgia, serif"
    font-size="56" font-weight="700">Keep the Markdown.</text>
  <rect x="70" y="340" width="68" height="5" rx="2.5" fill="#b14d2f"/>
  <text x="70" y="386" fill="#625f58" font-family="Avenir Next, Segoe UI, sans-serif"
    font-size="21">Daily notes · Knowledge base · Writing</text>
  <text x="70" y="422" fill="#625f58" font-family="PingFang SC, Noto Sans CJK SC, sans-serif"
    font-size="20">本地优先的 Markdown 写作与研究环境</text>

  <rect x="70" y="462" width="142" height="38" rx="19" fill="#171714"/>
  <text x="141" y="487" text-anchor="middle" fill="#f7f3ea"
    font-family="Avenir Next, Segoe UI, sans-serif" font-size="17" font-weight="700">Markdown</text>
  <rect x="222" y="462" width="112" height="38" rx="19" fill="#fffdf8" stroke="#d8d0c2"/>
  <text x="278" y="487" text-anchor="middle" fill="#625f58"
    font-family="Avenir Next, Segoe UI, sans-serif" font-size="17" font-weight="700">Research</text>
  <rect x="344" y="462" width="92" height="38" rx="19" fill="#fffdf8" stroke="#d8d0c2"/>
  <text x="390" y="487" text-anchor="middle" fill="#625f58"
    font-family="Avenir Next, Segoe UI, sans-serif" font-size="17" font-weight="700">Pandoc</text>
  <text x="70" y="590" fill="#b14d2f" font-family="Avenir Next, Segoe UI, sans-serif"
    font-size="19" font-weight="700">yungleung.github.io/yi</text>

  <rect x="630" y="90" width="602" height="388" rx="28" fill="#fffdf8"
    stroke="#d8d0c2" filter="url(#shadow)"/>
  <image href="data:image/webp;base64,${screenshot}" x="646" y="106" width="570" height="356"
    preserveAspectRatio="xMidYMid slice" clip-path="url(#shot)"/>
  <rect x="646" y="106" width="570" height="356" rx="22" fill="none" stroke="#d8d0c2"/>
</svg>
`;
const svgPath = new URL('site/assets/social-preview.svg', root);
await writeFile(svgPath, svg);

const output = new URL('site/assets/social-preview.png', root);
const converted = spawnSync(
  'rsvg-convert',
  ['-w', '1280', '-h', '640', '-o', output.pathname, svgPath.pathname],
  { encoding: 'utf8' }
);
if (converted.status !== 0) {
  throw new Error(converted.stderr || 'could not create social-preview.png');
}

console.log('site: built 1280x640 social-preview.png');
