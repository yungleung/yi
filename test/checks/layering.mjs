/**
 * Keeps the syntax layer pure.
 *
 * A module under `src/ui/markdown/syntax/` may import other syntax modules, the
 * AST types, the remark plugins that extend the parser, and the parser libraries
 * themselves. Anything else — the DOM, the caret, the renderer, the state, the
 * services — means a rule has reached upwards, which is what makes rules hard to
 * test and easy to duplicate. See `docs/architecture.md`.
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

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`layering: ${files.length} syntax modules stay inside the layer`);
