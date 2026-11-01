/**
 * The character grammar shared by citation parsing and citation completion.
 *
 * Example: `citationKeyCharacter(97)` is true for `a`, while `citationPrecedesAt(97)` is false so
 * `contact@example` stays prose instead of opening a citation.
 *
 * May import: micromark's ASCII character classifier. Upholds: the parser and completion popup use
 * one definition of where a Pandoc citation key starts and which characters continue it.
 */

import { asciiAlphanumeric } from 'micromark-util-character';

const BACKSLASH = 92;
const UNDERSCORE = 95;
const KEY_PUNCTUATION = new Set([58, 46, 35, 36, 37, 38, 45, 43, 63, 60, 62, 126, 47]);

/** Whether a character is one of Pandoc's permitted internal key punctuation marks. */
export function citationKeyPunctuation(code: number): boolean {
  return KEY_PUNCTUATION.has(code);
}

/** Whether `code` may be part of a citation key. */
export function citationKeyCharacter(code: number): boolean {
  return asciiAlphanumeric(code) || code === UNDERSCORE || citationKeyPunctuation(code);
}

/** Whether an `@` may start a citation after the character `before`. */
export function citationPrecedesAt(before: number): boolean {
  return Number.isNaN(before) || (!asciiAlphanumeric(before) && before !== BACKSLASH);
}
