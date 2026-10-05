/**
 * Checks what typing a bracket writes (`syntax/brackets.ts`) in Node: the pair and where the caret
 * lands, the `[[` case, the literal regions where nothing is written, a selection, stepping over a
 * closing bracket, and deleting an empty pair.
 *
 * The rules are pure, so they are asserted here; the editor's key path that calls them is
 * `test/probes/brackets.js`.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-brackets-'));

/** Bundles one module and imports it, the way every check loads its subject. */
async function bundleModule(input, name) {
  const bundle = await rolldown({ input, logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return import(file);
}

const { pairAround, pairingFor, skipClosingFor } = await bundleModule(
  'src/ui/markdown/syntax/brackets.ts',
  'brackets'
);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

// --- the pair ---------------------------------------------------------------------------------

check('a bracket in prose writes its pair, with the caret inside', pairingFor('ab', 2, '[', false), {
  from: 2,
  to: 2,
  insert: '[]',
  caret: 3
});
check(
  'and the pair goes where the caret is, not at the end',
  pairingFor('ab', 1, '[', false),
  { from: 1, to: 1, insert: '[]', caret: 2 }
);
check(
  'a second bracket in front of the first one\u2019s ] writes its own pair',
  pairingFor('[]', 1, '[', false),
  { from: 1, to: 1, insert: '[]', caret: 2 }
);
check(
  'while a key that closes itself writes only itself there',
  pairingFor('""', 1, '"', false),
  { from: 1, to: 1, insert: '"', caret: 2 }
);

check('steps over the ] it already wrote', pairingFor('[]', 1, ']', false), null);
check('and over the ) of a pair it wrote', skipClosingFor('()', 1, ')', false), true);
check('while a ) that was the author’s own is stepped over too', skipClosingFor('a)', 1, ')', false), true);
check('but a letter is not', skipClosingFor('ab', 1, 'b', false), false);

// --- what a keystroke leaves behind --------------------------------------------------------------

/**
 * Types `key` at `caret` the way the editor does: the two rules in the order the key path asks
 * them (`editing/text_commands.ts: insertText`), so the pair is judged on the text it leaves
 * behind and not only on the edit it returns.
 */
const typed = (text, caret, key, literal = false) => {
  if (skipClosingFor(text, caret, key, literal)) {
    return { text, caret: caret + 1 };
  }
  const edit = pairingFor(text, caret, key, literal);
  const at = edit?.from ?? caret;
  const stop = edit?.to ?? caret;
  const insert = edit?.insert ?? key;
  return {
    text: text.slice(0, at) + insert + text.slice(stop),
    caret: edit?.caret ?? caret + key.length
  };
};

const firstBracket = typed('', 0, '[');
check(
  'typing [[ is two pairs with the caret between them, not one and a half',
  typed(firstBracket.text, firstBracket.caret, '['),
  { text: '[[]]', caret: 2 }
);
check('and the ] the author types next steps over the first closer', typed('[[]]', 2, ']'), {
  text: '[[]]',
  caret: 3
});

// A run of a self-closing character is the author's own characters, one keystroke each: a code
// fence is three backticks, and a closer the app added would make it four.
check('a backtick after a backtick writes only itself', typed('`', 1, '`'), {
  text: '``',
  caret: 2
});
check('and so does the third', typed('``', 2, '`'), { text: '```', caret: 3 });

// --- where nothing is written ------------------------------------------------------------------

check('no pair inside a fenced code block or a formula', pairingFor('x = [', 4, '[', true), null);
check('no pair over a selection', pairingFor('words', 2, '[', false)?.to, 2);
check('and a key that is not a bracket writes itself', pairingFor('ab', 1, 'a', false), null);
check('a parenthesis pairs too', pairingFor('ab', 1, '(', false), {
  from: 1,
  to: 1,
  insert: '()',
  caret: 2
});

// --- taking a pair away ------------------------------------------------------------------------

check('backspace inside an empty pair takes both', pairAround('[]', 1), { from: 0, to: 2 });
check('and inside an empty parenthesis', pairAround('()', 1), { from: 0, to: 2 });
check('but not when the brackets hold something', pairAround('[a]', 2), null);
check('nor when they are not a pair', pairAround('][', 1), null);
check('nor when the caret is not between them', pairAround('[]', 0), null);
check('a quote pairs with itself', pairingFor('', 0, '"', false), {
  from: 0,
  to: 0,
  insert: '""',
  caret: 1
});

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('brackets: all checks passed');
