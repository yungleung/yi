/**
 * Checks the parser's side of the bargain with the constructs it can hold.
 *
 * markdown must survive a round trip: every node the pipeline can make has to parse
 * inside a description list — in a term and in a detail — and come back with the source
 * it was written as. The list plugin rebuilds its paragraph with a CommonMark-only
 * writer, so the editor's own nodes are flattened back to text for it and the terms and
 * details are re-parsed afterwards (`syntax/parser.ts: remarkDeflistCompat`,
 * `fixDescriptionPositions`); this is the check that says so, and the one the path had
 * none of when a citation in a detail made the whole note fail to open.
 *
 * The bundle is built for Node (`platform`), because the browser build of
 * `decode-named-character-reference` decodes entities by making a DOM element.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-parser-'));
/** Bundles one module with rolldown for Node and imports it. */
const load = async (input, name) => {
  const bundle = await rolldown({ input, logLevel: 'silent', platform: 'node' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return await import(file);
};

const { parseMarkdown } = await load('src/ui/markdown/syntax/parser.ts', 'parser');
const { nodeShape } = await load('src/ui/markdown/syntax/node_shape.ts', 'node_shape');

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

/** Every node of `type` in the tree, in document order. */
const nodesOfType = (tree, type) => {
  const found = [];
  const walk = (node) => {
    if (node && node.type === type) {
      found.push(node);
    }
    for (const child of node?.children ?? []) {
      walk(child);
    }
  };
  for (const child of tree.children) {
    walk(child);
  }
  return found;
};

/** A node's own source, read back through the offsets it carries. */
const sourceOf = (markdown, node) => {
  const from = node.position?.start?.offset;
  const to = node.position?.end?.offset;
  return typeof from === 'number' && typeof to === 'number' ? markdown.slice(from, to) : null;
};

/** The parse, or the message when it threw — a note that will not open. */
const parse = (markdown) => {
  try {
    return { tree: parseMarkdown(markdown) };
  } catch (error) {
    return { error: String(error) };
  }
};

/**
 * The constructs, each of which is a node the list plugin's own writer cannot serialize
 * — a set the flattened text hides from the plugin and the re-parse of each term and
 * detail brings back.
 */
const cases = [
  { name: 'a citation', type: 'citation', source: '@smith2020' },
  { name: 'a parenthetical citation', type: 'citation', source: '[@smith2020, p. 45]' },
  { name: 'a wikilink', type: 'wikilink', source: '[[Note|a title]]' },
  { name: 'inline math', type: 'inlineMath', source: '$x + y$' },
  { name: 'a strikethrough', type: 'delete', source: '~~struck~~' },
  {
    name: 'a footnote reference',
    type: 'footnoteReference',
    source: '[^1]',
    suffix: '\n[^1]: note\n'
  }
];

for (const { name, type, source, suffix = '' } of cases) {
  const detail = `term\n: detail with ${source} in it\n${suffix}`;
  const term = `a term with ${source}\n: detail\n${suffix}`;
  const control = `a paragraph with ${source} in it\n${suffix}`;

  // The control first: the ordinary pipeline makes this node, whatever a description
  // list does with it.
  const plain = parse(control);
  check(`${name} parses in a paragraph`, 'error' in plain ? plain.error : 'ok', 'ok');
  check(
    `and ${name} is a node there, with its own source`,
    'tree' in plain ? nodesOfType(plain.tree, type).map((node) => sourceOf(control, node)) : [],
    [source]
  );

  for (const [where, markdown] of [
    ['a detail', detail],
    ['a term', term]
  ]) {
    const parsed = parse(markdown);
    check(`${name} parses in ${where}`, 'error' in parsed ? parsed.error : 'ok', 'ok');
    if (!('tree' in parsed)) {
      continue;
    }
    check(`and ${where} is a description list`, nodeShape(parsed.tree.children).includes('descriptionlist'), true);
    // A reference needs its definition in the same parse, and a term or a detail is
    // re-parsed as a fragment: the fragment borrows the document's definitions, so the
    // node comes back — and the definition it borrowed may not appear in the list.
    const sources = nodesOfType(parsed.tree, type).map((node) => sourceOf(markdown, node));
    check(`and ${name} comes back in ${where}`, sources, [source]);
  }
}

// The flattening is only for a description-list paragraph: everything else keeps the
// nodes it always had.
const mixed = 'a paragraph with @smith2020 and [[Note]] and $x$ and ~~struck~~ in it\n';
check('an ordinary paragraph keeps every node it had', (() => {
  const parsed = parse(mixed);
  return 'tree' in parsed
    ? ['citation', 'wikilink', 'inlineMath', 'delete'].map((type) =>
        nodesOfType(parsed.tree, type).length
      )
    : [parsed.error];
})(), [1, 1, 1, 1]);

// The frontmatter is YAML: its two closing markers are read, and a TOML fence is text.
const dotted = '---\ntitle: X\n...\n\nBody\n';
const dottedTree = parseMarkdown(dotted);
check('a frontmatter closed by ... is frontmatter', dottedTree.children[0]?.type, 'yaml');
check(
  'and the marker is not body text',
  nodesOfType(dottedTree, 'paragraph').map((node) => sourceOf(dotted, node)),
  ['Body']
);
const toml = '+++\ntitle = "X"\n+++\n\nBody\n';
check('a +++ block is not frontmatter', nodesOfType(parseMarkdown(toml), 'yaml').length, 0);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('parser: all checks passed');
