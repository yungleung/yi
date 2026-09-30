/**
 * Two rules about what a module may reach for.
 *
 * **The syntax layer stays pure.** A module under `src/ui/markdown/syntax/` may import other syntax
 * modules, the AST types, the remark plugins that extend the parser, and the parser libraries
 * themselves. Anything else — the DOM, the caret, the renderer, the state, the services — means a
 * rule has reached upwards, which is what makes rules hard to test and easy to duplicate. See
 * `docs/architecture.md`.
 *
 * **The app never reaches into the tests.** Nothing under `src/` may import from `test/`: the app
 * ships and the fixtures do not, and a window that starts on a test's markdown is what that looks
 * like — the editor did exactly this, opening the fixture demo document for a reader who had asked
 * for nothing (`markdown_editor.ts`), until the first start was made to load nothing at all.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const syntaxDirectory = 'src/ui/markdown/syntax';
const markdownDirectory = 'src/ui/markdown';
const parserLibraries = /^(?:unified|remark-[\w.-]+|mdast[\w./-]*|micromark[\w./-]*)$/;

const files = readdirSync(syntaxDirectory)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => join(syntaxDirectory, name));

const failures = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/from '([^']+)'/g)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) {
      if (!parserLibraries.test(specifier)) {
        failures.push(`${file}: '${specifier}' is not a parser library`);
      }
      continue;
    }
    const target = resolve(dirname(file), specifier);
    const within = relative(resolve(syntaxDirectory), target);
    const withinMarkdown = relative(resolve(markdownDirectory), target);
    const allowed =
      !within.startsWith('..') || // another syntax module
      withinMarkdown === 'ast' || // the type aliases
      withinMarkdown.startsWith('plugins/'); // the parser's own extensions
    if (!allowed) {
      failures.push(`${file}: '${specifier}' leaves the syntax layer`);
    }
  }
}

/** Every TypeScript module the app is made of. */
const appFiles = [];
(function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(path);
    } else if (entry.name.endsWith('.ts')) {
      appFiles.push(path);
    }
  }
})('src');

const testDirectory = resolve('test');
for (const file of appFiles) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)) {
    const specifier = match[1].split('?')[0];
    if (!specifier.startsWith('.')) {
      continue;
    }
    const target = resolve(dirname(file), specifier);
    if (relative(testDirectory, target).startsWith('..')) {
      continue;
    }
    failures.push(`${file}: '${match[1]}' reaches into the tests`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(
  `layering: ${files.length} syntax modules stay inside the layer, and ${appFiles.length} app modules reach no test`
);
