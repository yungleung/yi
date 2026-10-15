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
 * - **what the settings name.** `mainfont` answers for anything the font it names has; `CJKmainfont`
 *   answers for CJK punctuation, kana and Han (extensions included) and **not** for Hangul — measured,
 *   and the reason a Korean note with only that variable named loses its Hangul. Which of the two a
 *   file names is the app's to read (the file's own bytes, comments not counted:
 *   `src-tauri/src/export.rs: named_fonts`), and it arrives here as the booleans in [`NamedFonts`].
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

/** The ranges `CJKmainfont` reaches, measured one page each: Hangul is deliberately absent. */
const CJK_MAIN_FONT_RANGES: readonly (readonly [number, number])[] = [
  [0x3000, 0x303f], // CJK punctuation: 、。「」
  [0x3040, 0x30ff], // hiragana and katakana
  [0x3400, 0x4dbf], // unified ideographs, extension A
  [0x4e00, 0x9fff], // unified ideographs
  [0xf900, 0xfaff], // compatibility ideographs
  [0x20000, 0x2fa1f] // extensions B to F
];

/** Whether a code point is inside one of `ranges`. */
function within(point: number, ranges: readonly (readonly [number, number])[]): boolean {
  return ranges.some(([first, last]) => point >= first && point <= last);
}

/** Whether the TeX suite's own font was measured to draw this character. */
function latinModernDraws(character: string): boolean {
  const point = character.codePointAt(0) ?? 0;
  return within(point, DRAWN_RANGES) || DRAWN.includes(character);
}

/**
 * The characters of `text` that nothing named in the settings can draw, each once, in the order they
 * appear — empty for a kind whose output carries the characters as characters, and empty for a
 * character a formula holds.
 */
export function uncoveredCharacters(text: string, fonts: NamedFonts): string[] {
  if (!fonts.needs_a_font || fonts.mainfont) {
    // A kind that carries the characters as characters needs no font named, and `mainfont` is a font
    // for the whole document: the reader who named one answered for everything it has.
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
    if (uncovered.includes(character) || inMaths(at) || latinModernDraws(character)) {
      continue;
    }
    if (fonts.cjk_mainfont && within(character.codePointAt(0) ?? 0, CJK_MAIN_FONT_RANGES)) {
      continue;
    }
    uncovered.push(character);
  }
  return uncovered;
}
