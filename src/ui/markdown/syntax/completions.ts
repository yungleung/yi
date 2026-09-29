/**
 * What the caret is inside when a list should open, and which entries belong in it.
 *
 * Two things are offered: a citation, while an `@` is being typed, and a wikilink between `[[` and
 * `]]`. Both are asked as *queries* — the offset the query starts at, and the characters typed so
 * far — so the popup only ever opens where the syntax says the construct can exist, and closing the
 * popup, filtering it and accepting from it are all decided from the same text the editor holds.
 *
 * A citation's query is bounded by the citation plugin's own characters (a key starts with a letter,
 * digit or `_` and continues with those plus pandoc's punctuation) and by its own rule for what may
 * precede an `@` — a letter, a digit or a backslash before it is an email or an escaped `@`, not a
 * citation. Those two characters sets are the plugin's, imported rather than re-spelled: the popup
 * and the syntax cannot disagree about where a citation is.
 *
 * May import: the citation plugin's own key characters. Upholds: one home for "what is being typed
 * here", so a list opens exactly where the construct it completes can live.
 */

import { citationKeyCharacter, citationPrecedesAt } from '../plugins/remark-citation/syntax';

/** The query the caret is inside, and where it started. */
export interface CompletionQuery {
  /** The document offset the query's own text starts at — after the `@`, or after `[[`. */
  from: number;
  /** What has been typed since, and what the entries are filtered by. */
  query: string;
}

/**
 * The citation the caret is typing inside, or null.
 *
 * The `@` has to be one the syntax would make a citation of: the character before it is not a
 * letter, digit or backslash, and everything between it and the caret is a key character. A locator
 * (`@key [p. 33]`) is not part of the query — the caret there is inside the bracketed part, where a
 * key is no longer being typed.
 */
export function citationQuery(text: string, caret: number): CompletionQuery | null {
  let start = caret;
  while (start > 0 && citationKeyCharacter(text.charCodeAt(start - 1))) {
    start -= 1;
  }
  if (text[start - 1] !== '@' || !citationPrecedesAt(text.charCodeAt(start - 2))) {
    return null;
  }
  return { from: start, query: text.slice(start, caret) };
}

/**
 * The wikilink the caret is typing inside, or null: `[[` before it, no `]]` between them, and no
 * `[` in the query itself (a third bracket is not a wiki target).
 */
export function wikilinkQuery(text: string, caret: number): CompletionQuery | null {
  let start = caret;
  while (start > 0 && text[start - 1] !== '[' && text[start - 1] !== ']' && text[start - 1] !== '\n') {
    start -= 1;
  }
  if (text[start - 1] !== '[' || text[start - 2] !== '[') {
    return null;
  }
  const query = text.slice(start, caret);
  return query.includes(']') ? null : { from: start, query };
}

/** One entry a list may offer: what it is called, and what accepting it writes. */
export interface CompletionChoice {
  /** What Enter writes — a citation key, or a document's id. */
  value: string;
  /** The name shown beside it: the title a citation carries, or a document's own title. */
  title: string;
}

/** How many choices a list offers before it stops. */
export const CHOICE_LIMIT = 50;

/**
 * The choices matching `query`, best first: a choice whose value or title *starts* with what is
 * being typed comes before one that merely holds it, and everything else keeps the order it came
 * in. An empty query keeps all of them — the list opens on everything, and narrows as the author
 * types.
 */
export function matchingChoices(
  choices: readonly CompletionChoice[],
  query: string,
  limit = CHOICE_LIMIT
): CompletionChoice[] {
  const needle = query.trim().toLowerCase();
  const score = (choice: CompletionChoice): number => {
    if (needle === '') {
      return 1;
    }
    const value = choice.value.toLowerCase();
    const title = choice.title.toLowerCase();
    if (value.startsWith(needle)) {
      return 0;
    }
    if (title.startsWith(needle)) {
      return 1;
    }
    return value.includes(needle) || title.includes(needle) ? 2 : -1;
  };
  const scored: { choice: CompletionChoice; rank: number; index: number }[] = [];
  choices.forEach((choice, index) => {
    const rank = score(choice);
    if (rank >= 0) {
      scored.push({ choice, rank, index });
    }
  });
  scored.sort((left, right) => left.rank - right.rank || left.index - right.index);
  return scored.slice(0, limit).map((entry) => entry.choice);
}
