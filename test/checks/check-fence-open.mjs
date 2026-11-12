/**
 * Checks what typing a delimiter line opens, in Node: the line becomes both of a fenced
 * block's delimiter lines, formula/frontmatter carets land in the body, a code-fence caret
 * stays after the opening backticks, a Div caret stays after its opening colons, and the blank
 * lines markdown needs around the block are added where they are missing.
 *
 * The rule is a pure function of the text, the caret and the character typed, so it is
 * asserted here; the editor's key path over it — including the language list a typed
 * ` ``` ` opens — is `fence-open-typing.js`.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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
const { containerFenceOpenWrite, fenceOpenWrite } = await import(pathToFileURL(file).href);

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
check('and the caret stays after the opening fence', typed(code, 8, '`').caret, 'text\n\n```'.length);
check('with the kind', typed(code, 8, '`').kind, 'fencedCode');
check('a tilde fence does the same', typed('text\n\n~~', 8, '~').text, 'text\n\n~~~\n\n~~~\n\n');
// The app writes a backtick's pair, so the pair — not the single key — is what completes the fence.
check(
  'the pair a backtick writes completes the fence',
  typed('`\n\nhello world\n', 1, '``').text,
  '```\n\n```\n\nhello world\n'
);
check('and its caret stays after the opening fence', typed('`\n\nhello world\n', 1, '``').caret, '```'.length);
const quotedCode = '> Intro\n> ``\n';
const quotedCodeOpen = containerFenceOpenWrite(quotedCode, 12, '`');
check(
  'a completed code fence keeps every generated line in its quote',
  quotedCodeOpen === null
    ? null
    : {
        kind: quotedCodeOpen.kind,
        text:
          quotedCode.slice(0, quotedCodeOpen.from) +
          quotedCodeOpen.replacement +
          quotedCode.slice(quotedCodeOpen.to),
        caret: quotedCodeOpen.caret
      },
  {
    kind: 'fencedCode',
    text: '> Intro\n> \n> ```\n> \n> ```\n> \n',
    caret: 16
  }
);

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
  'the auto-paired closing bracket does not stop labeled math from opening',
  typed('[$]\n\n', 2, '$').text,
  '[$$\n\n$$]{}\n\n'
);
check(
  'a pasted `[$$` opens the same block',
  typed('', 0, '[$$').text,
  '[$$\n\n$$]{}\n\n'
);

// A fenced Div waits for its delimiter space, then preserves every colon typed.
const calloutDiv = typed('text\n\n::::', 10, ' ');
check(
  'a space after the colons opens a paired default fenced Div',
  calloutDiv.text,
  'text\n\n::::\n\n::::\n\n'
);
check(
  'and the caret stays immediately after the opening colon fence',
  calloutDiv.caret,
  'text\n\n::::'.length
);
check('with the fenced-Div kind', calloutDiv.kind, 'fencedDiv');
check(
  'the third colon alone does not open a Div',
  typed('text\n\n::', 9, ':').kind,
  null
);
const nestedDivSource = ':::\n::::\n:::\n';
const nestedDivOpen = containerFenceOpenWrite(
  nestedDivSource,
  ':::\n::::'.length,
  ' '
);
check(
  'a Div typed inside another Div keeps the colon count the author typed',
  nestedDivOpen === null
    ? null
    : nestedDivSource.slice(0, nestedDivOpen.from) +
        nestedDivOpen.replacement +
        nestedDivSource.slice(nestedDivOpen.to),
  ':::\n\n::::\n\n::::\n\n:::\n'
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
