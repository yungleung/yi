/**
 * Checks which complete Pandoc Divs become semantic theorem nodes.
 *
 * Example: `.Theorem` uses the app's default vocabulary, `.Claim` requires a
 * frontmatter declaration, and `.Unknown` remains an ordinary fenced Div in
 * every case. Source positions must continue to name the original Markdown.
 *
 * May import: the bundled parser facade under test. Upholds: the check exercises
 * parser preparation and the real remark pipeline, not an isolated classifier.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-theorem-parser-'));
const load = async (input, name) => {
  const bundle = await rolldown({ input, logLevel: 'silent', platform: 'node' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return await import(file);
};
const { parseMarkdown } = await load('src/ui/markdown/syntax/parser.ts', 'parser');
const {
  DEFAULT_THEOREM_VOCABULARY,
  readTheorem,
  theoremsForParsers
} = await load('src/ui/markdown/syntax/theorem/index.ts', 'theorem');

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
const nodeOf = (tree, type) => {
  const found = [];
  const walk = (node) => {
    if (node?.type === type) found.push(node);
    for (const child of node?.children ?? []) walk(child);
  };
  for (const child of tree.children) walk(child);
  return found;
};
const sourceOf = (markdown, node) =>
  node === undefined
    ? null
    : markdown.slice(node.position.start.offset, node.position.end.offset);

const theorem =
  '::: {#thm:one .Theorem info="First"}\n' +
  'The body has **weight**.\n' +
  ':::';
const tree = parseMarkdown(theorem);
const theoremNode = nodeOf(tree, 'theorem')[0];
check('a built-in theorem becomes one theorem node', nodeOf(tree, 'theorem').length, 1);
check('the theorem keeps its exact source', sourceOf(theorem, theoremNode), theorem);
check('the theorem class is resolved', theoremNode?.theorem.type.className, 'Theorem');
check('the theorem ID is kept', theoremNode?.theorem.id, 'thm:one');
check('the theorem note is kept', theoremNode?.theorem.info, 'First');
check(
  'the theorem body is parsed',
  theoremNode?.children[0]?.children[1]?.type,
  'strong'
);

const customSource = [
  '---',
  'amsthm:',
  '  plain:',
  '    - Claim',
  '---',
  '',
  '::: {.Claim}',
  'Body.',
  ':::'
].join('\n');
const custom = nodeOf(parseMarkdown(customSource), 'theorem');
check('a declared custom class becomes a theorem', custom.length, 1);
check('it keeps the declared class', custom[0]?.theorem.type.className, 'Claim');
const proofTree = parseMarkdown('::: proof\nDone.\n:::');
check('a bare proof shorthand becomes a theorem', nodeOf(proofTree, 'theorem').length, 1);
check(
  'the proof shorthand is classified before remark runs',
  readTheorem('::: proof\nDone.\n:::', DEFAULT_THEOREM_VOCABULARY)?.type.className,
  'proof'
);
check(
  'the proof opening has an equal-length directive spelling',
  theoremsForParsers('::: proof\nDone.\n:::', DEFAULT_THEOREM_VOCABULARY),
  ':::thm   \nDone.\n:::'
);

check(
  'an undeclared class stays an ordinary fenced Div',
  nodeOf(parseMarkdown('::: {.Unknown}\nBody.\n:::'), 'theorem').length,
  0
);
check(
  'a theorem ID without the filter named form stays source',
  nodeOf(parseMarkdown('::: {#Thm:one .Theorem}\nBody.\n:::'), 'theorem').length,
  0
);
check(
  'two declared theorem classes are ambiguous and stay source',
  nodeOf(parseMarkdown('::: {.Theorem .Lemma}\nBody.\n:::'), 'theorem').length,
  0
);
check(
  'an unclosed theorem stays source',
  nodeOf(parseMarkdown('::: {.Theorem}\nBody.\n'), 'theorem').length,
  0
);

const quoted = parseMarkdown('> ::: {.Theorem}\n> Body.\n> :::');
check('a quoted theorem still becomes one theorem', nodeOf(quoted, 'theorem').length, 1);
check('and remains inside its blockquote', nodeOf(quoted, 'blockquote').length, 1);

const nested = parseMarkdown(
  ':::: {.Theorem}\n' +
  '::: {.callout-note}\n' +
  'Note.\n' +
  ':::\n' +
  '::::'
);
check('a nested callout survives inside a theorem', nodeOf(nested, 'callout').length, 1);
check('and the outer theorem survives', nodeOf(nested, 'theorem').length, 1);

const afterEquation = parseMarkdown(
  '[$$\nx = 1\n$$]{#eq:one}\n\n' +
  '::: {#thm:after .Theorem}\n' +
  'After the equation.\n' +
  ':::'
);
check(
  'an attributed equation does not hide a later theorem',
  nodeOf(afterEquation, 'theorem').length,
  1
);

if (failures.length > 0) {
  console.error(failures.join('\n\n'));
  process.exit(1);
}

console.log('theorem parser: all checks passed');
