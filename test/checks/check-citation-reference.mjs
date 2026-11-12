/**
 * Which works a citation asks a reference for (`services/bibliography/reference.ts`) in Node: every key
 * it names that the library holds, each once; nothing for a key it does not hold, and nothing at
 * all for a value that is not a citation.
 *
 * The rule has to be checked here rather than in the app because its second half — the formatting —
 * is citation-js's, and citation-js throws on a key the library does not hold. So this holds the
 * filter that keeps that from reaching it: a missing key is a work with nothing to show, not an
 * error, and the card that shows references appears only when something is left.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-citation-reference-'));
const bundle = await rolldown({ input: 'src/services/bibliography/reference.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'citation_reference.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { referenceIds } = await import(pathToFileURL(file).href);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const library = new Set(['smith2020', 'jones2019']);
const holds = (id) => library.has(id);

check('a parenthetical citation asks for the work it names', referenceIds('[@smith2020]', holds), [
  'smith2020'
]);
check('a narrative one too', referenceIds('@smith2020', holds), ['smith2020']);
check('and a suppressed author is still the same work', referenceIds('[-@smith2020]', holds), [
  'smith2020'
]);
check(
  'a cluster asks for each of its works, in the order it names them',
  referenceIds('[see @smith2020; also @jones2019, ch. 3]', holds),
  ['smith2020', 'jones2019']
);
check('a work named twice is asked for once', referenceIds('[@smith2020; @smith2020]', holds), [
  'smith2020'
]);
check('a key the library does not hold is left out', referenceIds('[@nosuchkey]', holds), []);
check(
  'and it does not take the keys it does hold with it',
  referenceIds('[@smith2020; @nosuchkey]', holds),
  ['smith2020']
);
check('a key with a locator is the same work', referenceIds('[@smith2020, p. 45]', holds), [
  'smith2020'
]);
check('text that is not a citation asks for nothing', referenceIds('contact@example.com', holds), []);
check('and neither does an empty one', referenceIds('', holds), []);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('citation reference: all checks passed');
