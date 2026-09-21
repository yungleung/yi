/**
 * The markdown markers themselves: what opens a fence, what closes it, what a
 * frontmatter delimiter is, what starts a list item and a new block, and what a
 * line that delimits a code block or a display formula looks like.
 *
 * May import: nothing but types. Upholds: one fact about markdown syntax has one
 * home, so a marker rule can never be restated — and drift — somewhere else.
 */

/** The frontmatter fence when the line is a lone `---` or `+++`. */
export function frontmatterDelimiter(line: string): '---' | '+++' | null {
  if (line.trim() === '---') {
    return '---';
  }
  if (line.trim() === '+++') {
    return '+++';
  }
  return null;
}

/** The fence marker (``` or ~~~) when the line opens a fenced code block. */
export function openingFence(line: string): string | null {
  const match = /^(?: {0,3})(`{3,}|~{3,})/.exec(line);
  return match ? match[1] : null;
}

/** The list marker info when the line starts a list item, or null. */
export function listMarker(line: string): { indent: number; ordered: boolean } | null {
  const match = /^( {0,3})([-*+]|\d+[.)])(?:\s+|$)/.exec(line);
  if (!match) {
    return null;
  }
  return { indent: match[1].length, ordered: /^\d/.test(match[2]) };
}

/**
 * The terminator regex of a long HTML block (commonmark types 1-5) when the
 * line opens one, or null. These blocks may span blank lines.
 */
export function htmlBlockTerminator(line: string): RegExp | null {
  const match = /^ {0,3}(<(?:script|pre|style|textarea)\b|<!--|<\?|<!\[CDATA\[|<![A-Z])/.exec(
    line
  );
  if (!match) {
    return null;
  }
  const open = match[1];
  if (/^<(?:script|pre|style|textarea)\b/.test(open)) {
    return /<\/(?:script|pre|style|textarea)>/i;
  }
  if (open.startsWith('<!--')) {
    return /-->/;
  }
  if (open.startsWith('<?')) {
    return /\?>/;
  }
  if (open.startsWith('<![CDATA[')) {
    return /\]\]>/;
  }
  return />/;
}

/** Whether a line closes a fence opened with `marker`. */
export function closingFence(line: string, marker: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith(marker[0])) {
    return false;
  }
  return /^(`{3,}|~{3,})$/.test(trimmed);
}

/** A bare bullet, ordered or task marker — `[ ]`/`[x]` is part of it. */
export const listItemMarker = /^\s*(?:[-+*]|\d+[.)])(?:\s+\[[ xX]\])?$/;

/** A line that delimits a fenced code block or a display formula. */
export function isDelimiterLine(line: string): boolean {
  return /^ {0,3}(?:`{3,}|~{3,})/.test(line) || /^ {0,3}\$\$\s*$/.test(line);
}

/** Line starts that cannot continue the paragraph above them. */
export const blockStartPattern =
  /^\s*(?:[-+*]|\d+[.)])\s|^\s*:\s|^\s*#{1,6}\s|^\s*(?:```|~~~|\$\$)/;

/** Whether this line begins a new block, so it cannot continue the one above. */
export function startsBlock(line: string): boolean {
  return blockStartPattern.test(line);
}
