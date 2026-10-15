/**
 * Checks the card's font hint (`ui/export/font_hint.ts`) in Node: which characters of a note no font
 * its conversion settings name can draw.
 *
 * The rule is a *measured* table, in three parts. What the TeX suite's own font holds was written down
 * character by character and not by blocks, because the blocks are irregular: `ə` draws and `ʃ`, `ɐ`,
 * `ʰ` do not; `← ↑ → ↓` draw and `↔` does not; `√ ∞ ± × ÷` draw and `≤ ≥ ≠ ≈ ∑ ∏` do not; `♪` draws
 * and `♭ ✓ ☺ ★ ☆` do not. What the faces this build ships draw comes from the fonts themselves, and
 * arrives as `shipped` ranges — taken here as the blocks they are shipped for, since the ranges are
 * read from the files by the Rust side (`export_fonts`) and proved against a page by
 * `export-pdf-scripts.js`. And what the settings answer for is `mainfont` (anything its font has) or
 * `CJKmainfont` (Han and kana, by the name the file gives).
 *
 * The third thing it checks is that a **formula is not a paragraph**: `$x \le y$` draws with the
 * maths font where a bare `≤` does not, which is why the rule walks the parse rather than the text.
 *
 * The bundle is built for Node, as `check-export.mjs`'s is, for the same reason.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-export-font-'));
const bundle = await rolldown({
  input: 'src/ui/export/font_hint.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'font_hint.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { uncoveredCharacters } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

/**
 * The ranges the faces this build ships draw, as the app reads them from the fonts — coarsely here: the
 * blocks each face is shipped for. The exact ranges are proved against the fonts by the Rust side and
 * against a page by `export-pdf-scripts.js`.
 */
const SHIPPED_RANGES = [
  [0x0370, 0x03ff], // Greek and Coptic
  [0x0400, 0x052f], // Cyrillic and its supplement
  [0x0530, 0x058f], // Armenian
  [0x0590, 0x05ff], // Hebrew
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic supplement
  [0x08a0, 0x08ff], // Arabic extended A
  [0x0900, 0x097f], // Devanagari
  [0x0e00, 0x0e7f], // Thai
  [0x10a0, 0x10ff], // Georgian
  [0x1100, 0x11ff], // Hangul jamo
  [0x1f00, 0x1fff], // Greek extended
  [0x2d00, 0x2d2f], // Georgian supplement
  [0x2de0, 0x2dff], // Cyrillic extended A
  [0x3000, 0x303f], // CJK punctuation
  [0x3040, 0x30ff], // hiragana and katakana
  [0x3130, 0x318f], // Hangul compatibility jamo
  [0x3400, 0x4dbf], // unified ideographs, extension A
  [0x4e00, 0x9fff], // unified ideographs
  [0xa640, 0xa69f], // Cyrillic extended B
  [0xac00, 0xd7af], // Hangul syllables
  [0xf900, 0xfaff] // compatibility ideographs
];

/** The shipped pdf file as the app reads it, and the shapes a reader's own file can take. */
const shipped = { needs_a_font: true, mainfont: false, cjk_mainfont: false, shipped: SHIPPED_RANGES };
const wide = { needs_a_font: true, mainfont: true, cjk_mainfont: false, shipped: SHIPPED_RANGES };
const namedCjk = { needs_a_font: true, mainfont: false, cjk_mainfont: true, shipped: SHIPPED_RANGES };
const plain = { needs_a_font: false, mainfont: false, cjk_mainfont: false, shipped: [] };

/** A script with no face of its own, and the symbols every face this build ships is measured to miss. */
const UNCOVERED = ['ʃ', 'ɐ', 'ʰ', '↔', '⇒', '⇐', '≤', '≥', '≠', '≈', '∑', '∏', '✓', '☺', '⚠', '♭',
                   '★', '☆'];

{
  // What Latin Modern was measured to hold: nothing to say about any of it.
  const drawn = [
    'A note with café, naïve, “quotes”, — and ¼.',
    'ā ē ī ū ř, ƒ ș ț, ə, a combining ä',
    'Tiếng Việt',
    '€ £ ¥ ™ © ® § † ‡ • …',
    '← ↑ → ↓ √ ∞ ± × ÷ ♪'
  ].join(' | ');
  check('what the default font was measured to draw is not reported', uncoveredCharacters(drawn, shipped), []);
}

{
  // The irregular half: these sit inside blocks a *range* table would call covered, and they are
  // missing all the same — one page each, through the app's own settings.
  for (const character of UNCOVERED) {
    check(
      `a character the default font was measured to miss is reported: ${character}`,
      uncoveredCharacters(character, shipped),
      [character]
    );
  }
  check(
    'and a character the default misses *is* quiet once a face this build ships draws it',
    uncoveredCharacters('αβγ ΔΩ', shipped),
    []
  );
  check(
    'and a note in a script outside Latin comes back with its characters, each once, in order',
    uncoveredCharacters('தமிழ் தமிழ்', shipped),
    ['த', 'ம', 'ி', 'ழ', '்']
  );
}

{
  // The scripts this build ships faces for, with nothing named in the settings at all: the point of
  // shipping them, and the difference from a build that named a font for CJK and nothing for the rest.
  check(
    'every script with a face of its own is drawn with no line added',
    uncoveredCharacters('简体中文、日本語。 Ελληνικά Русский العربية עברית हिन्दी ภาษาไทย Հայերեն ქართული', shipped),
    []
  );
  check('Hangul included, which the platform fonts for Han usually have none of', uncoveredCharacters('한국어', shipped), []);
  // Han outside the blocks the face holds: the extensions are the one part of a script this build
  // ships that a page can still lose, and a reader naming a font that has them is answered for.
  check('Han past the face’s own blocks is reported', uncoveredCharacters('𠀀𪛖', shipped), ['𠀀', '𪛖']);
  check('and not once a CJK font is named', uncoveredCharacters('𠀀𪛖', namedCjk), []);
  check('nor is a script with no face of its own, once a font is named for the document', uncoveredCharacters('தமிழ் ሰላም', wide), []);
}

{
  // A font for the whole document answers for everything the font it names has — and a kind whose
  // output carries the characters as characters needs no font named at all.
  check('a font named for the document answers for any script', uncoveredCharacters('தமிழ் ሰላም', wide), []);
  check('and a kind that carries the characters as characters is never asked', uncoveredCharacters('한국어 Русский', plain), []);
}

{
  // A formula is not a paragraph: pandoc sets `$…$` with the maths font, which draws what the text
  // font does not (measured: the same `≤` and `∑` are missing from a paragraph and present here).
  check('a character inside inline maths is not reported', uncoveredCharacters('Let $x \\le y$ hold.', shipped), []);
  check('nor one inside a display formula', uncoveredCharacters('$$\\sum_{i} a_i$$\n', shipped), []);
  check(
    'and the same character written as text is',
    uncoveredCharacters('Let x ≤ y hold.', shipped),
    ['≤']
  );
  check(
    'with what is written around the formula still read as text',
    uncoveredCharacters('$\\le$ but also தமிழ்', shipped),
    ['த', 'ம', 'ி', 'ழ', '்']
  );
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('export font hint: all checks passed');
