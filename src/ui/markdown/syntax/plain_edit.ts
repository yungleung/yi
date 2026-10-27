/**
 * Whether an edit can only change characters, never how the text parses.
 *
* The editor's fast path turns a keystroke into a write to one rendered text node
 * and no rendering at all, and this is the rule it trusts. Markdown is
 * context-sensitive: `x` typed between two asterisks is an emphasis, a character at the
 * start of a line can make it a list item or a heading, `.` after the `1` of `1 x` makes
 * it a list, and a character typed on the line above a `---` line makes that line a
 * setext underline. What the rule admits is a letter, a digit, a space and the
 * punctuation that means itself, in a place where none of those can happen; everything
 * else falls back to the ordinary re-render, which is always correct.
*
* What it may not do is call an edit plain when the parse would change, and
* `test/checks/check-plain-edit.mjs` is the property that keeps it honest: over a
 * seeded corpus of documents and edits it parses with the editor's own pipeline, so
 * every accepted edit must leave the parse's shape (`node_shape.ts`) unchanged, and
 * the tree it parses to must be the old one with the edit in the one leaf it lands in.
 * Read that check before widening the alphabet: each of the guards below is there
 * because it found an accepted edit whose parse had moved.
 *
 * May import: nothing — the text and the edit are passed in. Upholds: one fact
 * about markdown syntax has one home, and this is the home of which characters can
 * change how markdown reads.
 */

/**
 * What a plain edit may consist of: letters, digits, spaces, and the punctuation that
 * means itself in every inline position.
 *
 * What is *not* here is the point. A markdown construct needs a marker, and every
 * marker is a character this alphabet leaves out: the `*` and `_` of emphasis, the
 * `` ` `` of code, the `[]()` of a link, the `<>` of an autolink and the `&` of an
 * entity, the `\` of an escape, the `$` of math, the `~` of a strikethrough, the `|`
 * of a table, the `#` and `>` and `-` and `=` and `+` of a line's own beginning (which
 * the guards below answer for), the `:` of an email or a scheme and the `.` and `/`
 * and `@` of a URL. None of them can be typed as a plain edit, so no construct can be
 * opened from the inside of one.
 *
 * That leaves the characters an author actually writes in a sentence, and three things
 * a run of them can still do — `www.`, a block marker at a line's beginning, and two
 * spaces — each of which is a guard below, and each of which was found by the fuzz in
 * `test/checks/check-plain-edit.mjs` (16 of ~5 000 accepted edits changed the parse
 * without the marker guard; 1 without the autolink one).
 */
const PLAIN = /^[\p{L}\p{N} .,;:!?'"%+-]*$/u;

/** Whether every character of this text is one markdown reads as itself. */
function isPlainText(text: string): boolean {
  return PLAIN.test(text);
}

/**
 * Characters a block marker can be made of (see `document/blocks.ts`): an indent, a
 * bullet or a number, and the punctuation of a quote, a heading, a fence, a rule, a
 * setext underline, a table row or a description list.
 */
const MARKER_MATERIAL = /^[ \t\d+\-*.:>#`~=|]*$/;

/**
 * A marker and the space that ends it, so the line's content has begun: `# x`, `1. x`,
 * `- x`, `> x`, `: x`. Past one of these, a typed character is inside the line's text.
 */
const MARKER_PREFIX = /^ {0,3}(?:[-+*]|\d{1,9}[.)]|#{1,6}|>|:)\s+/;

/**
 * The runs of these characters that can still become a link. `www.` is the only
 * autolink they can spell — a scheme needs `/` and an email `@`, neither of which is
 * plain — and a link's *extent* is a node, so the characters are checked on both sides
 * of the edit and in the text on both sides of it: a character put into a run can start
 * the link and one taken out of it can end it.
 */
const AUTOLINK_RUN = /www\./i;

/** The line holding `at`, without its newline. */
function lineAt(text: string, at: number): string {
  const start = text.lastIndexOf('\n', Math.max(0, at - 1)) + 1;
  const end = text.indexOf('\n', Math.max(0, at));
  return text.slice(start, end === -1 ? text.length : end);
}

/** How many spaces the line ends with: two of them are a hard break. */
function trailingSpaces(line: string): number {
  let count = 0;
  while (count < line.length && line[line.length - 1 - count] === ' ') {
    count += 1;
  }
  return count;
}

/**
 * The text from the start of the run `from` sits in to the end of the run `to` ends in,
 * read as one span. The characters *between* the two ends are the run's too — the ones
 * a deletion takes out of the middle of it — which the ends alone would miss.
 */
function touchedRun(text: string, from: number, to: number): string {
  let start = Math.max(0, Math.min(from, text.length));
  let end = Math.max(start, Math.min(to, text.length));
  while (start > 0 && !/\s/.test(text[start - 1])) {
    start -= 1;
  }
  while (end < text.length && !/\s/.test(text[end])) {
    end += 1;
  }
  return text.slice(start, end);
}

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

/**
 * Whether the edit `before[from, to) → inserted` can change how its text parses.
 * `before` is the text the edit was applied to.
 */
export function isPlainEdit(
  before: string,
  from: number,
  to: number,
  inserted: string,
  literal: boolean = false
): boolean {
  if (!isPlainText(inserted) || !isPlainText(before.slice(from, to))) {
    return false;
  }
  // The runs the edit lands between have to be plain as well. That is what refuses the
  // places where a character is not just a character: a link's destination, a bare URL,
  // a footnote's label — runs whose characters are hidden from any rendering, so
  // nothing downstream would notice a change. Both sides, because the character whose
  // neighbour decides what it belongs to is not always the one being typed:
  // `seehttps://x` is a word, and one space before the URL makes its tail an autolink.
  const after = `${before.slice(0, from)}${inserted}${before.slice(to)}`;
  const left = wordAt(after, from);
  const right = runAfter(after, from + inserted.length);
  if (!isPlainText(left) || !isPlainText(right)) {
    return false;
  }
  // A run that holds `www.` is the one autolink these characters can spell, and the
  // link's extent is a node — so the characters are read on both sides of the edit and
  // in the text on both sides of it: what is typed can start the link and what is
  // deleted can end it.
  if (
    AUTOLINK_RUN.test(touchedRun(before, from, to)) ||
    AUTOLINK_RUN.test(touchedRun(after, from, from + inserted.length))
  ) {
    return false;
  }
  // The spaces of the line the edit is in are the line's own business: a run of two does
  // not render as the characters say (`nodes/text.ts: preserveSpaces` turns the second
  // into a no-break space), and the two at the end of a line are a hard break — a
  // construct a character typed *between* them would quietly delete. The line is the
  // scope, because the run an edit straddles is not the run a character of it sits in
  // (`ax, \n` + `. ` is a hard break).
  const line = lineAt(after, from);
  if (/ {2}/.test(line) || trailingSpaces(line) !== trailingSpaces(lineAt(before, from))) {
    return false;
  }
  // Line edges. A character typed at the start of a line can open a list, a
  // heading, a fence or a quote, and one typed at the end of a line can be what
  // the line the next one reads as a setext underline follows.
  const lineStart = before.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
  const newline = before.indexOf('\n', to);
  const lineEnd = newline === -1 ? before.length : newline;
  // The characters beside the edit. An asterisk next to the caret is an emphasis
  // waiting for a character, and what closes it can be an entirely plain one; the
  // characters on the far side of a deletion are the ones a marker would meet. Inside a
  // literal block, a line edge is a newline rather than a markdown neighbour.
  if (
    !(literal && from === lineStart) &&
    !isPlainText(before.slice(Math.max(0, from - 1), from))
  ) {
    return false;
  }
  if (!(literal && to === lineEnd) && !isPlainText(before.slice(to, to + 1))) {
    return false;
  }
  if (!literal && (from === lineStart || to === lineEnd)) {
    return false;
  }
  // A block marker is a few characters at a line's beginning, and a typed character can
  // finish one: `1 x` is prose and `1. x` is a list, `-x` is not a list once it has a
  // letter. So while everything before the caret is marker material the edit waits for
  // a marker that is already there and whose space has gone by (`1. x`, `# x`, `> x`).
  const prefix = before.slice(lineStart, from);
  if (!literal && MARKER_MATERIAL.test(prefix) && !MARKER_PREFIX.test(prefix)) {
    return false;
  }
  // A setext underline is made by the line below, so the line below is the rule's
  // business even though the edit is not in it.
  const nextStart = lineEnd + 1;
  const nextEnd = before.indexOf('\n', nextStart);
  const nextLine = before.slice(nextStart, nextEnd === -1 ? before.length : nextEnd);
  return !/^ {0,3}(=+|-+)\s*$/.test(nextLine);
}
