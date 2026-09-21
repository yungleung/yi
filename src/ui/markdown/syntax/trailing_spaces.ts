/**
 * Keeps the spaces markdown drops at the end of a line visible.
 *
 * A line's trailing spaces are insignificant to markdown: a single space is
 * stripped, and two or more only become a hard break when a continuation line
 * follows. The parser therefore drops them, so a space typed at the end of a
 * line renders as nothing and the caret has no position after it — which is
 * why a list item in the middle of a list, or a definition line followed by
 * another detail, could not be edited with a trailing space.
 *
 * The rewriting happens on the block's parse input: every trailing space run
 * the parser would drop becomes non-breaking spaces, which markdown keeps as
 * ordinary text and the browser renders without collapsing. Runs that do form
 * a hard break (two or more spaces followed by a continuation line) are left
 * untouched, so breaks keep working.
 *
 * The rewrite is length preserving — U+00A0 is one character, exactly like the
 * space it replaces — so node positions, offset mapping, formatting and the
 * raw document are all unaffected; the substitution only shows up in the
 * rendered DOM.
 */

import { isRawRendered, type MarkdownBlock } from '../blocks';
import { isBlankItemLine } from './lines';

/** Line starts that cannot continue the paragraph above them. */
const BLOCK_START =
  /^\s*(?:[-+*]|\d+[.)])\s|^\s*:\s|^\s*#{1,6}\s|^\s*(?:```|~~~|\$\$)/;

/** The text to parse for a block, with dropped trailing spaces made visible. */
export function blockParseInput(block: MarkdownBlock): string {
  return isRawRendered(block.kind) ? block.text : withVisibleTrailingSpaces(block.text);
}

/** Rewrites the trailing spaces markdown would drop with non-breaking ones. */
export function withVisibleTrailingSpaces(text: string): string {
  const lines = text.split('\n');
  return lines
    .map((line, index) => {
      const match = / +$/.exec(line);
      if (!match) {
        return line;
      }
      const stem = line.slice(0, match.index);
      // A blank item's trailing space is the marker's own delimiter: rewriting
      // it would stop the line from parsing as an item.
      if (isBlankItemLine(line)) {
        return line;
      }
      const isLastLine = index === lines.length - 1;
      const breakPossible =
        !isLastLine && match[0].length >= 2 && continuesParagraph(lines[index + 1]);
      return breakPossible
        ? line
        : `${stem}${'\u00a0'.repeat(match[0].length)}`;
    })
    .join('\n');
}

/** Whether a line continues the paragraph above it. */
function continuesParagraph(next: string | undefined): boolean {
  return next !== undefined && next.trim() !== '' && !BLOCK_START.test(next);
}
