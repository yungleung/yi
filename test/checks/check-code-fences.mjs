/**
 * Checks the Pandoc-compatible attributes on a fenced code block's opening line.
 *
 * A malformed or non-final attribute block is ordinary fence text; only a
 * parsed ID or non-empty caption turns the fence into a listing target.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-code-fences-'));
const bundle = await rolldown({
  input: 'src/ui/markdown/syntax/code/fences.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'fences.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { codeFenceData, listingFenceData } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const summary = (text) => {
  const data = codeFenceData(text);
  return {
    id: data.id,
    language: data.language,
    classes: data.classes,
    attributes: data.attributes,
    caption: data.caption,
    bodyStart: data.bodyStart
  };
};

check(
  'a bare language before an attribute block stays the language',
  summary('```python {#lst:one .wide caption="Example"}\nprint(1)\n```'),
  {
    id: 'lst:one',
    language: 'python',
    classes: ['python', 'wide'],
    attributes: { caption: 'Example' },
    caption: 'Example',
    bodyStart: 45
  }
);
check(
  'a language class in the attribute block is the language',
  summary('```{#lst:one .python .numberLines startFrom=5}\nprint(1)\n```'),
  {
    id: 'lst:one',
    language: 'python',
    classes: ['python', 'numberLines'],
    attributes: { startFrom: '5' },
    caption: null,
    bodyStart: 47
  }
);
check(
  'quoted braces and spaces stay in a caption',
  summary('```{#lst:one .js caption="A {quoted} caption" .numberLines}\nx\n```').caption,
  'A {quoted} caption'
);
check(
  'caption-only qualifies as a listing',
  listingFenceData('```python {caption="Example"}\nx\n```')?.caption,
  'Example'
);
check(
  'an empty caption alone is not a listing',
  listingFenceData('```python {caption=""}\nx\n```'),
  null
);
check(
  'a valid ID alone is a listing',
  listingFenceData('```python {#lst:one}\nx\n```')?.id,
  'lst:one'
);
check(
  'malformed attributes are not a listing',
  listingFenceData('```python {#lst:one caption="broken}\nx\n```'),
  null
);
check(
  'text after the attribute block is not a listing',
  listingFenceData('```python {#lst:one} trailing\nx\n```'),
  null
);
check(
  'attributes on the closing fence are ignored',
  listingFenceData('```python\nx\n``` {#lst:bogus}'),
  null
);
check(
  'an unclosed listing still has its body start',
  summary('```{#lst:one .python}\nprint(1)'),
  {
    id: 'lst:one',
    language: 'python',
    classes: ['python'],
    attributes: {},
    caption: null,
    bodyStart: 22
  }
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('code fences: all checks passed');
