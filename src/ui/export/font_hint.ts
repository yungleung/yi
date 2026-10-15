/**
 * Which characters of a note no font its conversion settings name can draw.
 *
 * The card's hint is this rule's only reader (`export_dialog.ts`), and what it answers with is a list
 * of the note's own characters — what the conversion would lose, not what to do about it, which is the
 * reader's line in the settings file the card names beside it.
 *
 * Two facts decide it, and neither of them is a font:
 *
 * - **what the note is written in.** The TeX suite's own font is Latin Modern, and what it holds is
 *   written down character by character rather than trusted to its blocks, because the blocks are
 *   irregular — measured, one page each: `ə` draws and `ʃ`, `ɐ`, `ʰ` do not; `← ↑ → ↓` draw and `↔`
 *   does not; `√ ∞ ± × ÷` draw and `≤ ≥ ≠ ≈ ∑ ∏` do not; `♪` draws and `♭`, `✓`, `☺`, `★`, `☆` do
 *   not; `Δ Ω` draw and `α β γ` do not. So the covered set is the ranges measured *whole*
 *   ([`DRAWN_RANGES`]) plus the characters measured outside them ([`DRAWN`]), and everything else is
 *   a character the default page loses.
 * - **what the app and the settings between them have.** This build ships a face per script
 *   (`src-tauri/src/export_fonts.rs`), and the export wires them into the page, so most of what used
 *   to be reported — every non-Latin script but Tamil and its neighbours — draws with no line added
 *   at all. What they draw is *not* a list kept beside them: it is read out of the fonts' own cmap
 *   tables and arrives here as `NamedFonts.shipped`, so a face swapped for another cannot leave this
 *   hint quiet about a page that lost a character. On top of that, `mainfont` answers for anything the
 *   font it names has, and `CJKmainfont` for Han and kana: the export draws those with the name the
 *   file gives (`export_fonts::write_header`). Which of the two a file names is the app's to read (the
 *   file's own bytes, comments not counted: `src-tauri/src/export.rs: named_fonts`).
 *   A file may also name a face for **one script at a time** (`yi-<script>-font:`), which is the third
 *   thing the hint steps aside for: `NamedFonts.named_scripts` says which, and the ranges below say
 *   what that script's characters are.
 *
 * **A formula is not a paragraph.** `$x \le y$` and `$\sum_i a_i$` draw: pandoc sets those with Latin
 * Modern *Math*, which has what the text font lacks (measured — the same `≤` and `∑` are missing from
 * a paragraph and present in a formula). So characters inside an `inlineMath` or `math` node are left
 * out, which is why this walks the parse rather than scanning the text it came from.
 *
 * May import: the parser, the AST and the span walk. Upholds: one fact about what a page loses has one
 * home, and it is a rule about a document — which is what lets `check-export-font.mjs` hold it in
 * Node.
 */

import { parseMarkdown } from '../markdown/syntax/parser';
import type { NamedFonts } from '../../api/export';
import { spansOfType, type Walkable } from './node_spans';

/** The ranges Latin Modern was measured to hold **whole**, in one page each with the default settings. */
const DRAWN_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x024f], // ASCII, Latin-1, and Latin extended A and B (`ā ř ƒ ș ț` all drew)
  [0x0300, 0x036f], // combining marks: a decomposed `ä` draws
  [0x1e00, 0x1eff], // Latin extended additional: Vietnamese
  [0x2000, 0x206f], // general punctuation: — – ‘ ’ “ ” … § † ‡ •
  [0x20a0, 0x20cf], // currency: € £ ¥
  [0x2100, 0x214f] // letterlike: ™ © ®
];

/**
 * The characters measured to draw although the blocks around them are not held whole — the irregular
 * half, and the reason this is a list of characters and not of blocks.
 */
const DRAWN = 'ə←↑→↓√∞±×÷♪';

/**
 * The ranges a `CJKmainfont` in the settings file answers for: Han and kana, and the punctuation and
 * compatibility blocks that go with them. Not Hangul — Hangul is drawn with the face this build ships
 * whatever the file names, which is the one thing a platform's Han font usually has none of.
 */
const CJK_MAIN_FONT_RANGES: readonly (readonly [number, number])[] = [
  [0x2e80, 0x2fff], // radicals, strokes and ideographic description characters
  [0x3000, 0x303f], // CJK punctuation: 、。「」
  [0x3040, 0x30ff], // hiragana and katakana
  [0x3100, 0x31ff], // Bopomofo, kanbun, katakana phonetic extensions
  [0x3200, 0x32ff], // enclosed CJK letters and months
  [0x3400, 0x4dbf], // unified ideographs, extension A
  [0x4e00, 0x9fff], // unified ideographs
  [0xf900, 0xfaff], // compatibility ideographs
  [0xff00, 0xffef], // halfwidth and fullwidth forms
  [0x1aff0, 0x1b16f], // kana extended B, kana supplement and extensions
  [0x1f200, 0x1f2ff], // enclosed ideographic supplement
  [0x20000, 0x3ffff] // extensions B to H, which the face this build ships holds only a few of
];

/** Whether a code point is inside one of `ranges`. */
function within(point: number, ranges: readonly (readonly [number, number])[]): boolean {
  return ranges.some(([first, last]) => point >= first && point <= last);
}

/** Whether xeCJK routes this character to the CJK font (Han, kana, CJK punctuation, Hangul). */
function reachedByCjkFont(point: number): boolean {
  return within(point, CJK_MAIN_FONT_RANGES);
}

/** Whether the TeX suite's own font was measured to draw this character. */
function latinModernDraws(character: string): boolean {
  const point = character.codePointAt(0) ?? 0;
  return within(point, DRAWN_RANGES) || DRAWN.includes(character);
}

/** Whether a face this build ships draws this character — read from the fonts, see `NamedFonts`. */
function shippedDraws(point: number, fonts: NamedFonts): boolean {
  return fonts.shipped.some(([first, last]) => point >= first && point <= last);
}

/**
 * The Hangul blocks. The face this build ships draws them whatever the settings name, so a Hangul
 * character that no shipped face holds is not one a `mainfont` line would save, either: the header
 * routes it to that face on its own.
 */
const HANGUL_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x11ff], // jamo
  [0x3130, 0x318f], // compatibility jamo
  [0xa960, 0xa97f], // jamo extended A
  [0xac00, 0xd7af], // syllables
  [0xd7b0, 0xd7ff] // jamo extended B
];

/**
 * The blocks each shipped script's face draws, so that a `yi-<script>-font:` line can be honored: a
 * character of a script whose face the reader named is theirs, and the hint says nothing about it.
 *
 * The names are the header's own (`export_fonts::SLOTS`), and these ranges are the blocks its routing
 * hands to that face. Hangul is here as well — a script the build ships a face for and a reader may
 * still name one for.
 */
const SCRIPT_RANGES: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  Greek: [
    [0x0370, 0x03ff], // Greek and Coptic
    [0x1f00, 0x1fff] // Greek extended
  ],
  Cyrillic: [
    [0x0400, 0x052f], // Cyrillic and its supplement
    [0x1c80, 0x1c8f], // Cyrillic extended C
    [0x2de0, 0x2dff], // Cyrillic extended A
    [0xa640, 0xa69f] // Cyrillic extended B
  ],
  Hebrew: [
    [0x0590, 0x05ff], // Hebrew
    [0xfb1d, 0xfb4f] // its presentation forms, which the shipped face draws
  ],
  Arabic: [
    [0x0600, 0x06ff], // Arabic
    [0x0750, 0x077f], // supplement
    [0x0870, 0x08ff], // extended A and B
    [0xfb50, 0xfdff], // presentation forms A
    [0xfe70, 0xfeff], // presentation forms B
    [0x1ee00, 0x1eeff] // mathematical alphabetic symbols
  ],
  Devanagari: [
    [0x0900, 0x097f], // Devanagari
    [0xa8e0, 0xa8ff], // extended
    [0x11b00, 0x11b5f] // extended A
  ],
  Thai: [[0x0e00, 0x0e7f]],
  Armenian: [[0x0530, 0x058f]],
  Georgian: [
    [0x10a0, 0x10ff], // Georgian
    [0x1c90, 0x1cbf], // extended
    [0x2d00, 0x2d2f] // supplement
  ],
  Hangul: HANGUL_RANGES
};

/** Whether the settings file names a face for the script this character belongs to. */
function scriptOfReader(point: number, fonts: NamedFonts): boolean {
  return fonts.named_scripts.some((script) => within(point, SCRIPT_RANGES[script] ?? []));
}

/**
 * The characters of `text` that nothing named in the settings can draw, each once, in the order they
 * appear — empty for a kind whose output carries the characters as characters, and empty for a
 * character a formula holds.
 */
export function uncoveredCharacters(text: string, fonts: NamedFonts): string[] {
  if (!fonts.needs_a_font) {
    // A kind whose output carries the characters as characters needs no font named at all.
    return [];
  }
  const tree = parseMarkdown(text) as unknown as Walkable;
  const maths = [
    ...spansOfType(tree, 'inlineMath'),
    ...spansOfType(tree, 'math')
  ].map((span) => [span.start, span.end] as const);
  const inMaths = (offset: number): boolean =>
    maths.some(([start, end]) => offset >= start && offset < end);
  const uncovered: string[] = [];
  let offset = 0;
  for (const character of text) {
    const at = offset;
    offset += character.length;
    const point = character.codePointAt(0) ?? 0;
    if (
      uncovered.includes(character) ||
      inMaths(at) ||
      latinModernDraws(character) ||
      scriptOfReader(point, fonts) ||
      shippedDraws(point, fonts)
    ) {
      continue;
    }
    if (reachedByCjkFont(point)) {
      // Han and kana are drawn with the name the file gives, for as much as that font holds — which is
      // not something the app can read out of a name, so a reader who names one is taken at their word.
      // Hangul is not in this branch: the face this build ships draws it, so a Hangul character that
      // got here is one that face does not hold either, and naming a Han font would not save it.
      if (fonts.cjk_mainfont) {
        continue;
      }
    } else if (fonts.mainfont && !within(point, HANGUL_RANGES)) {
      // Any other script: the font named for the document answers for what it has. Hangul is not one of
      // them — it is drawn with the shipped face, so a Hangul character that got here is one that face
      // does not hold and a `mainfont` line would not reach.
      continue;
    }
    uncovered.push(character);
  }
  return uncovered;
}
