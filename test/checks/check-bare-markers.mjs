/**
 * Checks what the parser makes of a marker-only line: an empty item when the marker carries
 * its delimiter space (`- `), text when it does not (`-`), and never a setext heading that
 * swallows the paragraph above it.
 *
 * The repair is a pure function of the parse and the source, so it is asserted here;
 * `bare-marker-typing.js` proves the same through the editor's key path.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-bare-markers-'));
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

/** The parse's node types and nesting. */
const shape = (markdown) => nodeShape(parseMarkdown(markdown).children);

/** Every text node's own characters, read back through the offsets it carries. */
const texts = (markdown) => {
  const found = [];
  const walk = (node) => {
    if (node.type === 'text') {
      const from = node.position?.start?.offset;
      const to = node.position?.end?.offset;
      found.push(typeof from === 'number' && typeof to === 'number' ? markdown.slice(from, to) : null);
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  for (const child of parseMarkdown(markdown).children) {
    walk(child);
  }
  return found;
};

// A bare marker is the character itself, wherever markdown would have made markup of it.
check('a bare bullet is text', shape('-\n'), 'paragraph(text)');
check('a bare ordered marker too', shape('1.\n'), 'paragraph(text)');
check('an indented bare marker is text, and the marker is what is rendered', [
  shape('  -\n'),
  texts('  -\n')
], ['paragraph(text)', ['-']]);
check('a bare marker under a paragraph leaves the paragraph alone', shape('foo\n-\n'), 'paragraph(text),paragraph(text)');
check('and the marker keeps its own characters', texts('foo\n-\n'), ['foo', '-']);

// The marker's delimiter space is what makes the item.
check('a bullet and its space are an empty item', shape('- \n'), 'list(listItem)');
check('a nested empty item too', shape('  - \n'), 'list(listItem)');
check('and an empty task item', shape('- [ ]\n'), 'list(listItem(paragraph(text)))');
check('under a paragraph an empty item stays one', shape('foo\n- \n'), 'paragraph(text),list(listItem)');

// Real lists are left as they were.
check('a list with content keeps its shape', shape('- a\n- b\n'), 'list(listItem(paragraph(text)),listItem(paragraph(text)))');
check('and a list with an empty middle item keeps it', shape('- a\n-\n- c\n'), 'list(listItem(paragraph(text)),listItem,listItem(paragraph(text)))');
check('a `---` underline is still the setext heading it was', shape('foo\n---\n'), 'heading(text)');
check('and a `---` line of its own is still the rule it was', shape('---\n'), 'thematicBreak');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('bare markers: all checks passed');
