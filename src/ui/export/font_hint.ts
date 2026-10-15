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
 *   is what xeCJK routes **CJK punctuation, kana, Han and Hangul** to — measured: with both variables
 *   named, a Korean note's Hangul was set with the *CJK* font and lost with it, so `mainfont` cannot
 *   answer for Hangul while a CJK font is named. Whether that font has Hangul is not something the app
 *   can read out of a name; it knows only what the file *it ships* holds (`NamedFonts.cjk_covers_hangul`
 *   — measured: the shipped `Songti SC` has none), and takes the reader's own font to hold what they
 *   chose it for. Which of the two variables a file names is the app's to read (the file's own bytes,
 *   comments not counted: `src-tauri/src/export.rs: named_fonts`).
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
 * The ranges xeCJK routes to `CJKmainfont`, measured one page each — Hangul among them: with both
 * variables named, a Korean note's Hangul went to the *CJK* font (and was lost with `Songti SC`).
 */
const CJK_MAIN_FONT_RANGES: readonly (readonly [number, number])[] = [
  [0x3000, 0x303f], // CJK punctuation: 、。「」
  [0x3040, 0x30ff], // hiragana and katakana
  [0x3400, 0x4dbf], // unified ideographs, extension A
  [0x4e00, 0x9fff], // unified ideographs
  [0xac00, 0xd7af], // hangul syllables, which the CJK font is asked for and `mainfont` cannot save
  [0xf900, 0xfaff], // compatibility ideographs
  [0x20000, 0x2fa1f] // extensions B to F
];

/** Whether a code point is inside one of `ranges`. */
function within(point: number, ranges: readonly (readonly [number, number])[]): boolean {
  return ranges.some(([first, last]) => point >= first && point <= last);
}

/** Whether xeCJK routes this character to the CJK font (Han, kana, CJK punctuation, Hangul). */
function reachedByCjkFont(point: number): boolean {
  return within(point, CJK_MAIN_FONT_RANGES);
}

/**
 * Whether the character is a Hangul syllable — the one routed range a CJK font may or may not hold, and
 * the reason `cjk_covers_hangul` is asked about: the shipped `Songti SC` has none of them (measured).
 */
function isHangul(point: number): boolean {
  return point >= 0xac00 && point <= 0xd7af;
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
    if (uncovered.includes(character) || inMaths(at) || latinModernDraws(character)) {
      continue;
    }
    const point = character.codePointAt(0) ?? 0;
    if (reachedByCjkFont(point)) {
      // A CJK character is the CJK variable's business *where a CJK font is named*, and nobody else's:
      // with one named, `mainfont` cannot answer for a Hangul character (measured) and Hangul is
      // answered for only where the app knows that font has it — the reader's own, never the shipped
      // one. A file that names no CJK font leaves the whole range to the document's font, as any other
      // script (measured: `mainfont` alone draws Han, kana and Hangul).
      const answeredByCjk =
        fonts.cjk_mainfont && (!isHangul(point) || fonts.cjk_covers_hangul);
      if (answeredByCjk || (!fonts.cjk_mainfont && fonts.mainfont)) {
        continue;
      }
    } else if (fonts.mainfont) {
      continue; // Any other script: the font named for the document answers for what it has.
    }
    uncovered.push(character);
  }
  return uncovered;
}
