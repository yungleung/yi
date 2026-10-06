/**
 * The class names the editor draws, and the rules that draw them.
 *
 * The app's own classes start with `markdown-`, and the stylesheet is where they are given ink.
 * Two things can drift apart silently: a name the app sets that no rule draws (a rename in
 * `styles.css` leaves the DOM class behind, and the ink simply disappears), and a rule for a name
 * nothing sets (a leftover). Both directions are checked.
 *
 * A name may be *deliberately* rule-less: a **hook** is a name the app uses to find or mark
 * something, not to draw it — the placeholder spans, the source-view wrapper — and those are listed
 * below with the reason. Everything else must have a rule.
 *
 * This check reads sources rather than bundling them: it is about where the names are, not what
 * they do. `docs/structure.md`'s conventions table names it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = 'src';
const stylesheet = 'src/styles.css';

/** Names with no rule on purpose: what each is, and where. */
const hooks = {
  'markdown-citation-placeholder': 'the formatted text has not arrived yet',
  'markdown-empty-line-placeholder': 'the empty line is drawn by its paragraph',
  'markdown-footnote-preview': 'the card is drawn by the floating surface it is',
  'markdown-footnote-source': 'a label’s source is shown inline, without the source chrome',
  'markdown-source-view': 'marks the element a source is shown in; the source styles it'
};

const files = [];
(function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (path.endsWith('.ts')) {
      files.push(path);
    }
  }
})(root);

const inSources = new Map();
for (const file of files) {
  for (const match of readFileSync(file, 'utf8').matchAll(/markdown-[a-z0-9-]+/g)) {
    const where = inSources.get(match[0]) ?? new Set();
    where.add(relative(root, file));
    inSources.set(match[0], where);
  }
}

const inStylesheet = new Set(
  [...readFileSync(stylesheet, 'utf8').matchAll(/\.(markdown-[a-z0-9-]+)/g)].map((match) => match[1])
);

const failures = [];
for (const [name, where] of inSources) {
  if (inStylesheet.has(name) || name in hooks) {
    continue;
  }
  failures.push(`${name} is set in ${[...where].join(', ')} but has no rule in ${stylesheet}`);
}
for (const name of inStylesheet) {
  if (!inSources.has(name)) {
    failures.push(`${stylesheet} draws ${name}, which nothing in ${root}/ sets`);
  }
}
for (const name of Object.keys(hooks)) {
  if (!inSources.has(name)) {
    failures.push(`${name} is listed as a hook but nothing in ${root}/ uses it`);
  }
  if (inStylesheet.has(name)) {
    failures.push(`${name} is listed as a hook but ${stylesheet} draws it`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(
  `class names: ${inSources.size} names the app uses, ` +
    `${inStylesheet.size} drawn by the stylesheet, ${Object.keys(hooks).length} hooks with no rule`
);
