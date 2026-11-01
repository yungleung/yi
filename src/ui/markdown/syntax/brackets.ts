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
 * The rule is also what makes `[[` a wikilink. The second `[` finds the `]` the first one's pair
 * put after the caret — the *app's* closer, waiting for a closer of its own — and writes its pair
 * in front of it, so the two brackets that result are `[[` and `]]` with the caret between them.
 * A key that closes itself (a quote, a backtick) already reads as its own pair there, so it writes
 * only itself.
 *
 * `pairBacktick` is false in Pandoc Div source: there a single backtick is the
 * first character of a code fence, so pairing it would add a character the
 * author did not type.
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

/** Whether a key opens a pair with a different closing character. */
export function isOpeningBracket(key: string): boolean {
  const closing = PAIRS[key];
  return closing !== undefined && closing !== key;
}

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
 *
 * Example: `pairingFor('a', 1, '[', false)` returns
 * `{ from: 1, to: 1, insert: '[]', caret: 2 }`.
 */
export function pairingFor(
  text: string,
  caret: number,
  key: string,
  literal: boolean,
  pairBacktick = true
): BracketEdit | null {
  const closing = PAIRS[key];
  if (closing === undefined || literal || (key === '`' && !pairBacktick)) {
    return null;
  }
  // A key that closes itself, typed straight after one of its own kind, is the author writing a run
  // of the character — a run of backticks is a code fence (`syntax/markers.ts`), and a closer the
  // app added would make the run one character longer than the keystrokes that wrote it.
  if (key === closing && text[caret - 1] === key) {
    return { from: caret, to: caret, insert: key, caret: caret + 1 };
  }
  // The character at the caret is this pair's closer, put there with its opener by a pair the app
  // wrote earlier. A second opener means a pair *in front of* that closer — which is what makes
  // `[[` two pairs, `[[]]`, and not one and a half. A key that closes itself is already that
  // pair, and writing it again would leave three of them.
  if (text[caret] === closing) {
    const insert = key === closing ? key : `${key}${closing}`;
    return { from: caret, to: caret, insert, caret: caret + 1 };
  }
  return { from: caret, to: caret, insert: `${key}${closing}`, caret: caret + 1 };
}

/**
 * Whether typing `closing` at `caret` should step over the character already there, which is the
 * other half of a pair the app wrote: the author typing the bracket they can see moves past it
 * rather than writing a second one.
 *
 * Example: `skipClosingFor('[]', 1, ']', false)` returns true; the same call with a
 * caret at offset 0 returns false.
 */
export function skipClosingFor(text: string, caret: number, key: string, literal: boolean): boolean {
  return !literal && (key === ']' || key === ')' || key === '}') && text[caret] === key;
}

/**
 * The pair an empty bracket is, when the author deletes its opening: the offsets of the two
 * characters to take away, or null when the caret is not between a pair that holds nothing.
 *
 * Example: `pairAround('a[]b', 2)` returns `{ from: 1, to: 3 }`;
 * `pairAround('a[x]b', 2)` returns null because the pair is not empty.
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
