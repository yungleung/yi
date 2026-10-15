/**
 * Checks the card's font hint (`ui/export/font_hint.ts`) in Node: which characters of a note no font
 * its conversion settings name can draw.
 *
 * The rule is a *measured* table, in two halves. What the TeX suite's own font holds was written down
 * character by character and not by blocks, because the blocks are irregular: `ə` draws and `ʃ`, `ɐ`,
 * `ʰ` do not; `← ↑ → ↓` draw and `↔` does not; `√ ∞ ± × ÷` draw and `≤ ≥ ≠ ≈ ∑ ∏` do not; `♪` draws
 * and `♭ ✓ ☺ ★ ☆` do not; `Δ Ω` draw and `α β γ` do not. And what the settings answer for is
 * `mainfont` (anything its font has) or `CJKmainfont` (CJK punctuation, kana and Han — and not
 * Hangul).
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

/** The shipped pdf file as the app reads it, and the shapes a reader's own file can take. */
const shipped = { needs_a_font: true, mainfont: false, cjk_mainfont: true, cjk_covers_hangul: false };
const wide = { needs_a_font: true, mainfont: true, cjk_mainfont: false, cjk_covers_hangul: false };
const bothWide = { needs_a_font: true, mainfont: true, cjk_mainfont: true, cjk_covers_hangul: true };
const plain = { needs_a_font: false, mainfont: false, cjk_mainfont: false, cjk_covers_hangul: false };

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
  for (const character of 'ʃɐʰ↔⇒⇐≤≥≠≈∑∏✓☺⚠♭★☆αβγ') {
    check(
      `a character the default font was measured to miss is reported: ${character}`,
      uncoveredCharacters(character, shipped),
      [character]
    );
  }
  check(
    'and a note in a script outside Latin comes back with its characters, each once, in order',
    uncoveredCharacters('한국어 Русский 한국어', shipped),
    ['한', '국', '어', 'Р', 'у', 'с', 'к', 'и', 'й']
  );
}

{
  // CJK: `CJKmainfont` answers for punctuation, kana and Han, and not for Hangul.
  check('the script the shipped file names a font for is not reported', uncoveredCharacters('简体中文、日本語。「」', shipped), []);
  check('Hangul is not that script, so it is', uncoveredCharacters('한국어', shipped), ['한', '국', '어']);
  const noFont = { needs_a_font: true, mainfont: false, cjk_mainfont: false };
  check(
    'and a file that names no font at all reports the CJK too',
    uncoveredCharacters('简体中文', noFont),
    ['简', '体', '中', '文']
  );
}

{
  // A font for the whole document answers for everything the font it names has — and a kind whose
  // output carries the characters as characters needs no font named at all.
  check('a font named for the document answers for any script', uncoveredCharacters('한국어 Русский 简体中文', wide), []);
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
    uncoveredCharacters('$\\le$ but also 한국어', shipped),
    ['한', '국', '어']
  );
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('export font hint: all checks passed');
