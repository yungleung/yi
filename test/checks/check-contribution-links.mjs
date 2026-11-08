/**
 * Keeps the README and public site pointed at the supported community entry points.
 *
 * Example: renaming the Discussions destination in one surface without updating
 * the others fails this check before visitors are sent to a stale route.
 */
import { readFileSync } from 'node:fs';

const links = {
  contribute: 'https://github.com/yungleung/yi/contribute',
  goodFirst:
    'https://github.com/yungleung/yi/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22good%20first%20issue%22',
  helpWanted:
    'https://github.com/yungleung/yi/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22help%20wanted%22',
  discussions: 'https://github.com/yungleung/yi/discussions',
  issueChooser: 'https://github.com/yungleung/yi/issues/new/choose'
};
const surfaces = {
  README: readFileSync('README.md', 'utf8'),
  landing: readFileSync('site/index.html', 'utf8'),
  documentation: readFileSync('scripts/build-site.mjs', 'utf8')
};
const failures = [];
const check = (name, pass) => {
  if (!pass) failures.push(name);
};

for (const [name, content] of Object.entries(surfaces)) {
  for (const [link, url] of Object.entries(links)) {
    if (name === 'README' || link !== 'issueChooser') {
      check(`${name} links to ${link}`, content.includes(url));
    }
  }
}

const app = readFileSync('site/app.js', 'utf8');
for (const copy of [
  'Community and contribution links',
  '社区与贡献链接',
  'Good first issues',
  '适合初次贡献的问题',
  'Help wanted',
  '需要帮助的问题',
  'Discussions',
  '讨论区'
]) {
  check(`site footer copy includes ${copy}`, app.includes(copy));
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('contribution links: README, landing page and Documentation agree');
