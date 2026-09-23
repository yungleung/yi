/**
 * Whether an edit can only change characters, never how the text parses.
 *
 * The editor's fast path turns a keystroke into a write to one rendered text node
 * and no rendering at all, and this is the rule it trusts. The rule is deliberately
 * narrow: markdown is context-sensitive, so `x` typed between two asterisks is an
 * emphasis, a character at the start of a line can make it a list item or a
 * heading, and a character typed on the line above a `---` line makes that line a
 * setext underline. Anything that could do one of those falls back to the ordinary
 * re-render, which is always correct.
 *
 * What it may not do is call an edit plain when the parse would change, and
 * `test/checks/check-plain-edit.mjs` is the property that keeps it honest: over a
 * seeded corpus of documents and edits, every accepted edit must leave the parse's
 * shape (`node_shape.ts`) unchanged.
 *
 * May import: nothing — the text and the edit are passed in. Upholds: one fact
 * about markdown syntax has one home, and this is the home of which characters can
 * change how markdown reads.
 */

/**
 * What a plain edit may consist of: letters, and nothing else.
 *
 * Every markdown construct that a typed character could open or close needs
 * something that is not a letter and is not the space inside a line — the `*` of an
 * emphasis, the `[]()` of a link, the `` ` `` of code, the `#` or a line edge of a
 * heading, the `-` or digit of a list, the `|` of a table, the `.` and `:` and `/`
 * of a URL, the `&` of an entity, the `-=` of a setext underline, the `$` of math,
 * the `<>` of HTML. A letter typed inside an existing construct leaves that
 * construct as it was, and so does a space between two words.
 *
 * The two constructs a space can open are line edges — the two trailing spaces of a
 * hard break, and the ones that begin an indented code block — and the rule refuses
 * a line edge outright. What it has to watch instead is the *run* a space joins: a
 * space that glues itself to one side of a URL turns a word into an autolink, and a
 * space inside a run with punctuation in it is a space in a destination or a label.
 * Both sides of the edit therefore have to be words (see `isPlainEdit`).
 */
const PLAIN = /^[\p{L} ]*$/u;

/** Whether every character of this text is one markdown reads as itself. */
function isPlainText(text: string): boolean {
  return PLAIN.test(text);
}

/** A space, a letter… or nothing at all: what may sit beside a plain edit. */
const PLAIN_NEIGHBOUR = /^(?:\p{L}| )?$/u;

/**
 * The word holding `at`: the run of characters between the whitespace around it.
 * For a space the edit inserted, that is the word on its *left*.
 */
function wordAt(text: string, at: number): string {
  let start = Math.max(0, Math.min(at, text.length));
  let end = start;
  while (start > 0 && !/\s/.test(text[start - 1])) {
    start -= 1;
  }
  while (end < text.length && !/\s/.test(text[end])) {
    end += 1;
  }
  return text.slice(start, end);
}

/** The run of characters from `at` up to the next whitespace: the word on its right. */
function runAfter(text: string, at: number): string {
  let end = Math.max(0, Math.min(at, text.length));
  while (end < text.length && !/\s/.test(text[end])) {
    end += 1;
  }
  return text.slice(at, end);
}

/** The run of spaces touching `at`, on either side of it. */
function spacesAt(text: string, at: number): string {
  let start = Math.max(0, Math.min(at, text.length));
  let end = start;
  while (start > 0 && text[start - 1] === ' ') {
    start -= 1;
  }
  while (end < text.length && text[end] === ' ') {
    end += 1;
  }
  return text.slice(start, end);
}

/**
 * Whether the edit `before[from, to) → inserted` can change how its text parses.
 * `before` is the text the edit was applied to.
 */
export function isPlainEdit(before: string, from: number, to: number, inserted: string): boolean {
  if (!isPlainText(inserted) || !isPlainText(before.slice(from, to))) {
    return false;
  }
  // The runs the edit lands between have to be plain words as well. That is what
  // refuses the places where a letter is not just a letter: a link's destination
  // (`https://example.com`), a bare URL, a footnote's label — runs a typed character
  // can break, and whose characters are hidden from any rendering, so nothing
  // downstream would notice. Both sides, because a space is the one character whose
  // *neighbour* decides what it belongs to: `seehttps://x` is a word, and one space
  // before the URL makes its tail an autolink.
  const after = `${before.slice(0, from)}${inserted}${before.slice(to)}`;
  if (!isPlainText(wordAt(after, from))) {
    return false;
  }
  if (!isPlainText(runAfter(after, from + inserted.length))) {
    return false;
  }
  // A run of two spaces does not render as the characters say (`nodes/text.ts:
  // preserveSpaces` turns the second into a no-break space), so writing one in would
  // put the DOM out of step with the document.
  if (/ {2}/.test(inserted) || spacesAt(after, from).length > 1) {
    return false;
  }
  // The characters beside the edit. An asterisk next to the caret is an emphasis
  // waiting for a character, and what closes it can be an entirely plain one; the
  // characters on the far side of a deletion are the ones a marker would meet.
  if (!PLAIN_NEIGHBOUR.test(before.slice(Math.max(0, from - 1), from))) {
    return false;
  }
  if (!PLAIN_NEIGHBOUR.test(before.slice(to, to + 1))) {
    return false;
  }
  // Line edges. A character typed at the start of a line can open a list, a
  // heading, a fence or a quote, and one typed at the end of a line can be what
  // the line the next one reads as a setext underline follows.
  const lineStart = before.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
  const newline = before.indexOf('\n', to);
  const lineEnd = newline === -1 ? before.length : newline;
  if (from === lineStart || to === lineEnd) {
    return false;
  }
  // A setext underline is made by the line below, so the line below is the rule's
  // business even though the edit is not in it.
  const nextStart = lineEnd + 1;
  const nextEnd = before.indexOf('\n', nextStart);
  const nextLine = before.slice(nextStart, nextEnd === -1 ? before.length : nextEnd);
  return !/^ {0,3}(=+|-+)\s*$/.test(nextLine);
}
