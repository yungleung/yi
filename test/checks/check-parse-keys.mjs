/**
 * Checks that a block's parse is held under everything it was parsed from.
 *
 * markdown reads `[^x]` as a footnote reference only when the definition is part of
 * the same parse, and this editor parses one block at a time — so a block holding a
 * marker is parsed with the document's definitions *borrowed*
 * (`syntax/footnote/parse_context.ts: withFootnoteDefinitions`). That makes the document's labels
 * a second input to the parse, and so to the rendering built from it: renaming or
 * removing a definition has to re-parse every block that borrowed it, which is what
 * `document/state.ts: parseKey` says. Measured on the app before the key existed:
 * the two markers of `First[^a] and[^a] again.` kept drawing `[a]` after the notes
 * run renamed their definition to `[^ab]`. `test/probes/footnote-repeat-label.js`
 * holds the visible half of this.
 *
 * The bundle is built for Node (`platform`), because the parser's entity decoding
 * makes a DOM element in the browser build.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const bundle = await rolldown({
  input: 'src/ui/markdown/document/state.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const directory = mkdtempSync(join(tmpdir(), 'yi-parse-keys-'));
const file = join(directory, 'state.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { MarkdownEditorState } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const doc = 'Body text[^1] here.\n\nA plain paragraph.\n\n[^1]: first note\n';
const state = new MarkdownEditorState();
state.loadText(doc);
const body = () => state.getBlocks()[0];
const plain = () => state.getBlocks()[1];
/** Whether a node holds a footnote reference, however deep in its children. */
const holdsReference = (node) =>
  node.type === 'footnoteReference' ||
  (node.children ?? []).some((child) => holdsReference(child));
/** Whether a block's parse holds a footnote reference. */
const hasReference = (block) => state.getBlockContent(block).some(holdsReference);
/** Where the definition's own `1` sits. */
const labelAt = () => state.getText().indexOf('[^1]:') + 2;

check('the body`s marker parses as a footnote reference', hasReference(body()), true);
const bodyKey = state.parseKey(body());
const plainKey = state.parseKey(plain());

// A keystroke in a note cannot change which labels exist, and the text that did not
// change keeps the parse it had: no key may move.
const inNote = state.getText().indexOf('first note') + 5;
state.replaceRange(inNote, inNote, 'X');
check('typing in a note writes it', state.getText().includes('[^1]: firstX note'), true);
check('and the body`s key is the one it had', state.parseKey(body()) === bodyKey, true);
check('and a block with no marker in it is untouched', state.parseKey(plain()) === plainKey, true);
check('and the marker is still a reference', hasReference(body()), true);

// Renaming the label takes the definition away from every block that borrowed it.
const at = labelAt();
state.replaceRange(at, at + 1, '9');
check('the document holds the renamed label', state.getText().includes('[^9]: firstX note'), true);
check('the borrowed block`s key moved with the labels', state.parseKey(body()) !== bodyKey, true);
check('and its marker is the characters it is now', hasReference(body()), false);
check(
  'and a block the labels cannot reach keeps the key it had',
  state.parseKey(plain()) === plainKey,
  true
);

// Undo is an edit like any other: the labels come back, and so does the reference.
state.undo();
check('one undo puts the label back', state.getText() === doc.replace('first note', 'firstX note'), true);
check('and the marker parses as a reference again', hasReference(body()), true);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('parse keys: all checks passed');
