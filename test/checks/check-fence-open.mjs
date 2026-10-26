/**
 * Checks what typing a delimiter line opens, in Node: the line becomes both of a fenced
 * block's delimiter lines, the caret lands on the blank line between them, and the blank
 * lines markdown needs around the block are added where they are missing.
 *
 * The rule is a pure function of the text, the caret and the character typed, so it is
 * asserted here; the editor's key path over it — including the language list a typed
 * ` ``` ` opens — is `fence-open-typing.js`.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

// The editing modules import the caret layer and the language list, which touch the DOM at
// import time; the rule under test never does.
globalThis.document = {
  addEventListener() {},
  createElement: () => ({
    style: {},
    classList: { add() {}, contains: () => false },
    dataset: {},
    appendChild() {},
    setAttribute() {},
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null
  }),
  querySelectorAll: () => [],
  querySelector: () => null,
  createRange: () => ({})
};
globalThis.window = {
  getSelection: () => null,
  addEventListener() {},
  innerWidth: 1000,
  innerHeight: 800,
  __TAURI_INTERNALS__: {
    transformCallback: () => 1,
    invoke: async () => null
  }
};

const directory = mkdtempSync(join(tmpdir(), 'yi-fence-open-'));
const bundle = await rolldown({ input: 'src/ui/markdown/editing/fence_open.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'fence_open.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { fenceOpenWrite } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

/** What the editor ends up with: the rule's write, or the ordinary insert when it has none. */
const typed = (text, at, letter) => {
  const write = fenceOpenWrite(text, at, letter);
  if (!write) {
    return { kind: null, text: `${text.slice(0, at)}${letter}${text.slice(at)}`, caret: at + letter.length };
  }
  return {
    kind: write.kind,
    text: `${text.slice(0, write.from)}${write.replacement}${text.slice(write.to)}`,
    caret: write.caret
  };
};

// `---` at the very top of a note is frontmatter, and the note's own text keeps its place
// below it. The caret sits on the blank line between the delimiters.
check('`---` on the first line opens frontmatter', typed('--\n\ntail\n', 2, '-').text, '---\n\n---\n\ntail\n');
check('and the caret lands on the body’s blank line', typed('--\n\ntail\n', 2, '-').caret, '---\n'.length);
check('with the kind the block is', typed('--\n\ntail\n', 2, '-').kind, 'frontmatter');
check(
  'on an empty note it still gets the blank line under it',
  typed('--', 2, '-').text,
  '---\n\n---\n\n'
);
check(
  'an indented delimiter still starts the note',
  typed('  --\n\ntext\n', 4, '-').text,
  '---\n\n---\n\ntext\n'
);
// Anywhere else `---` is the thematic break it always was.
check('`---` below the first line is not frontmatter', typed('text\n--', 7, '-'), {
  kind: null,
  text: 'text\n---',
  caret: 8
});

// A typed code fence makes its own closing delimiter, so the note below it is not the code.
const code = 'text\n\n``';
check('a typed ` ``` ` closes itself off', typed(code, 8, '`').text, 'text\n\n```\n\n```\n\n');
check('and the caret goes to the blank line between the fences', typed(code, 8, '`').caret, 'text\n\n```\n'.length);
check('with the kind', typed(code, 8, '`').kind, 'fencedCode');
check('a tilde fence does the same', typed('text\n\n~~', 8, '~').text, 'text\n\n~~~\n\n~~~\n\n');
// The app writes a backtick's pair, so the pair — not the single key — is what completes the fence.
check(
  'the pair a backtick writes completes the fence',
  typed('`\n\nhello world\n', 1, '``').text,
  '```\n\n```\n\nhello world\n'
);
check('and its caret is on the blank line too', typed('`\n\nhello world\n', 1, '``').caret, '```\n'.length);

// And so does a display formula.
const formula = 'text\n\n$';
check('a typed `$$` closes itself off', typed(formula, 7, '$').text, 'text\n\n$$\n\n$$\n\n');
check('and the caret goes to the blank line', typed(formula, 7, '$').caret, 'text\n\n$$\n'.length);
check('with the kind', typed(formula, 7, '$').kind, 'displayMath');

// `[$$` opens one labeled display-math span, with an empty attribute placeholder.
const labeled = typed('[$]\n\ntail\n', 2, '$');
check(
  'typing `[$$` opens labeled display math',
  labeled.text,
  '[$$\n\n$$]{}\n\ntail\n'
);
check('and the caret lands on the formula body', labeled.caret, '[$$\n'.length);
check('with the equation kind', labeled.kind, 'equation');
check(
  'the three typed characters `[$$` open it too',
  typed('[$', 2, '$').text,
  '[$$\n\n$$]{}\n\n'
);
check(
  'a pasted `[$$` opens the same block',
  typed('', 0, '[$$').text,
  '[$$\n\n$$]{}\n\n'
);

// What is not a delimiter line of its own stays ordinary typing.
check('a delimiter made in front of text is not one', typed('x``', 1, '`').kind, null);
check('a delimiter typed over a selection is not one', typed('``', 0, '`').kind, null);
check('and neither is a delimiter in the middle of its own line', typed('--', 1, '-').kind, null);
check('a character that does not finish the delimiter is not one', typed('``', 2, 'x').kind, null);
check('a bare marker is not a fence', typed('', 0, '-').kind, null);
check('and neither is a longer run of dashes', typed('----', 4, '-').kind, null);
check('labeled math typed in prose is not a block', typed('say [$]', 5, '$').kind, null);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('fence open: all checks passed');
