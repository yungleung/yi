/**
 * What typing a bracket does: the `]` the app writes for the author, and the two courtesies that
 * keep a pair from being a nuisance — stepping over a `]` it already wrote, and taking the pair
 * away when the `[` is deleted.
 *
 * A pair is written where prose is being written: not inside a *literal* region (a fenced code
 * block, a display formula, an inline code span), where the characters are the author's source and
 * a `]` the app adds changes what the text means. Neither is a pair written around a selection: an
 * author who has selected words and types `[` is starting a link or a citation over them, and a
 * `]` after the selection would be put where nothing expects it.
 *
 * The rule is also what makes `[[` a wikilink: the second `[` sees the `]` the first one's pair
 * put after the caret and writes only the `[` — so the pair is `[]` around nothing, and the two
 * brackets that result are `[[` and `]]`.
 *
 * May import: nothing — the text and the caret are passed in. Upholds: one answer to "what does
 * typing a bracket write", so the editor's key path and the check beside this file cannot drift.
 */

/** The brackets that come in pairs, and the character each writes. */
const PAIRS: Readonly<Record<string, string>> = {
  '[': ']',
  '(': ')',
  '{': '}',
  '"': '"',
  "'": "'",
  '`': '`'
};

/** What a keystroke does to the text, as one edit. */
export interface BracketEdit {
  /** How many characters the caret sits at the start of. */
  from: number;
  /** How many characters the caret sits at the end of. */
  to: number;
  /** What is written there. */
  insert: string;
  /** Where the caret lands, as an offset the caller turns into a document one. */
  caret: number;
}

/**
 * What typing `key` at `caret` writes, or null when it writes itself — which is the answer for
 * every key that is not a bracket, for a bracket typed inside a literal region, and for one typed
 * over a selection.
 */
export function pairingFor(
  text: string,
  caret: number,
  key: string,
  literal: boolean
): BracketEdit | null {
  const closing = PAIRS[key];
  if (closing === undefined || literal) {
    return null;
  }
  // A `]` the app already wrote is not written again, and the caret passes between the two: this
  // is the half that makes `[[` two brackets and not three.
  if (text[caret] === closing) {
    return { from: caret, to: caret, insert: key, caret: caret + 1 };
  }
  return { from: caret, to: caret, insert: `${key}${closing}`, caret: caret + 1 };
}

/**
 * Whether typing `closing` at `caret` should step over the character already there, which is the
 * other half of a pair the app wrote: the author typing the bracket they can see moves past it
 * rather than writing a second one.
 */
export function skipClosingFor(text: string, caret: number, key: string, literal: boolean): boolean {
  return !literal && (key === ']' || key === ')' || key === '}') && text[caret] === key;
}

/**
 * The pair an empty bracket is, when the author deletes its opening: the offsets of the two
 * characters to take away, or null when the caret is not between a pair that holds nothing.
 */
export function pairAround(
  text: string,
  caret: number
): { from: number; to: number } | null {
  const opening = text[caret - 1];
  const closing = opening === undefined ? undefined : PAIRS[opening];
  if (closing === undefined || text[caret] !== closing) {
    return null;
  }
  return { from: caret - 1, to: caret + 1 };
}
