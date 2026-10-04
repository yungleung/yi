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

/** The marker a thematic break is written with, on a line of its own. */
export const thematicBreakMarker = '---';

/** A line that delimits a fenced code block or a display formula. */
export function isDelimiterLine(line: string): boolean {
  return /^ {0,3}(?:`{3,}|~{3,})/.test(line) || /^ {0,3}\$\$\s*$/.test(line);
}

/** A block's lines, with the offset each starts at. A trailing newline makes no line of its own. */
function blockLines(text: string): Array<{ start: number; text: string }> {
  const lines: Array<{ start: number; text: string }> = [];
  let cursor = 0;
  for (;;) {
    const breakAt = text.indexOf('\n', cursor);
    const end = breakAt < 0 ? text.length : breakAt;
    lines.push({ start: cursor, text: text.slice(cursor, end) });
    if (breakAt < 0 || breakAt + 1 >= text.length) {
      return lines;
    }
    cursor = breakAt + 1;
  }
}

/**
 * The body of a fenced block — the lines between its delimiter lines — as a block-relative range.
 *
 * The delimiters are never drawn: the body is what the block shows, and the caret maps through the
 * body's own characters (`caret/offsets.ts`), so this is the one place that says where it begins
 * and ends. Its end carries the last content line's newline, which is what gives a caret there —
 * and the line Enter makes at it — somewhere to be. An unclosed fence's last line is content
 * rather than a delimiter, so there the body runs to the end of the block.
 */
export function fenceBody(text: string): { start: number; end: number } {
  const lines = blockLines(text);
  const first = lines[0];
  if (first === undefined) {
    return { start: 0, end: 0 };
  }
  const start = Math.min(first.start + first.text.length + 1, text.length);
  const last = lines[lines.length - 1];
  const closes =
    lines.length > 1 &&
    (isDelimiterLine(last.text) || frontmatterDelimiter(last.text) !== null);
  return { start, end: Math.max(start, closes ? last.start : text.length) };
}

/** The language a fence names — `` ```js `` → `js` — or the empty string when it names none. */
export function fenceLanguage(line: string): string {
  const fence = openingFence(line);
  if (fence === null) {
    return '';
  }
  const info = line.slice(line.indexOf(fence) + fence.length).trim();
  return info === '' ? '' : info.split(/\s+/)[0];
}

/** Line starts that cannot continue the paragraph above them. */
export const blockStartPattern =
  /^\s*(?:[-+*]|\d+[.)])\s|^\s*:\s|^\s*#{1,6}\s|^\s*(?:```|~~~|\$\$)/;

/** Whether this line begins a new block, so it cannot continue the one above. */
export function startsBlock(line: string): boolean {
  return blockStartPattern.test(line);
}
