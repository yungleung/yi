/**
 * The markdown markers themselves: what opens a fence, what closes it, what a
 * frontmatter delimiter is, what starts a list item and a new block, and what a
 * line that delimits a code block or a display formula looks like.
 *
 * May import: nothing but types. Upholds: one fact about markdown syntax has one
 * home, so a marker rule can never be restated — and drift — somewhere else.
 */

/** The frontmatter's opening fence when the line is a lone `---`, or null. */
export function frontmatterDelimiter(line: string): '---' | null {
  return line.trim() === '---' ? '---' : null;
}

/**
 * Whether a line closes a YAML frontmatter block.
 *
 * YAML writes the end of a document as `---` or `...`, and both mean the same thing to the note:
 * the lines above are the frontmatter and the lines below are its body.
 */
export function closesFrontmatter(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === '---' || trimmed === '...';
}

/**
 * The text between a leading YAML frontmatter's delimiters.
 *
 * Example: `'---\ntitle: A\n---\nBody'` returns `'title: A'`.
 */
export function frontmatterText(markdown: string): string | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)/.exec(markdown);
  return match ? match[1] : null;
}

/**
 * The same text with a leading frontmatter's `...` end marker written as `---`.
 *
 * `remark-frontmatter` closes a `---` block on `---` alone, so its parser is handed this spelling
 * of the same document. Both markers are three characters, which keeps every offset the parser
 * reports — and the carets and selections derived from them — pointing at the same characters.
 *
 * Example: `'---\ntitle: A\n...\nBody'` becomes `'---\ntitle: A\n---\nBody'`.
 */
export function frontmatterForParsers(markdown: string): string {
  const opening = /^---(?:\r?\n)/.exec(markdown);
  if (!opening) {
    return markdown;
  }
  let at = opening[0].length;
  for (;;) {
    const newline = markdown.indexOf('\n', at);
    const end = newline < 0 ? markdown.length : newline;
    const line = markdown.slice(at, end);
    const marker = line.trim();
    if (marker === '---') {
      return markdown;
    }
    if (marker === '...') {
      const dots = at + line.indexOf('...');
      return `${markdown.slice(0, dots)}---${markdown.slice(dots + 3)}`;
    }
    if (newline < 0) {
      return markdown;
    }
    at = newline + 1;
  }
}

/**
 * The fence marker (``` or ~~~) when the line opens a fenced code block.
 *
 * Example: `'  ```js'` returns `'```'`; `'text'` returns null.
 */
export function openingFence(line: string): string | null {
  const match = /^(?: {0,3})(`{3,}|~{3,})/.exec(line);
  return match ? match[1] : null;
}

/**
 * The list marker info when the line starts a list item, or null.
 *
 * The marker's delimiter space is part of it: `- ` opens an item, and a bare `-` is the character
 * itself, which is why the space is required here (see `bareMarkerLine` and
 * `syntax/bare_markers.ts`).
 *
 * Example: `'- item'` returns `{ indent: 0, ordered: false }`; `'  1. item'` returns
 * `{ indent: 2, ordered: true }`.
 */
export function listMarker(line: string): { indent: number; ordered: boolean } | null {
  const match = /^( {0,3})([-*+]|\d+[.)])\s+/.exec(line);
  if (!match) {
    return null;
  }
  return { indent: match[1].length, ordered: /^\d/.test(match[2]) };
}

/** The fence delimiter a line holds when it is nothing but one: ` ``` `, `~~~`, `$$` or `---`. */
export function soleDelimiter(line: string): string | null {
  const match = /^ {0,3}(`{3,}|~{3,}|\$\$|---)$/.exec(line.trimEnd());
  return match ? match[1] : null;
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

/**
 * Whether a line closes a fence opened with `marker`.
 *
 * Example: `closingFence('```', '```')` returns true; `closingFence('```js', '```')`
 * returns false because a closing line carries no language.
 */
export function closingFence(line: string, marker: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith(marker[0])) {
    return false;
  }
  return /^(`{3,}|~{3,})$/.test(trimmed);
}

/**
 * An empty list item's own line: a bullet, ordered or task marker with nothing but the
 * delimiter space after it — `[ ]`/`[x]` is part of it.
 */
export const listItemMarker = /^\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\])?\s*$/;

/** A line holding a list marker with nothing after it, not even the delimiter's own space. */
export const bareMarkerLine = /^ {0,3}(?:[-+*]|\d+[.)])$/;

/** A heading marker with no delimiter space: the characters are not a heading yet. */
export const bareHeadingLine = /^ {0,3}#{1,6}$/;

/** A heading marker with only its delimiter whitespace: the empty heading has begun. */
export const delimiterOnlyHeadingLine = /^ {0,3}#{1,6}[ \t]+$/;

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
 *
 * Example: `'```js\nlet x = 1;\n```'` returns `{ start: 6, end: 15 }`, covering
 * `'let x = 1;\n'`; the same-line formula `'$$x$$'` returns `{ start: 2, end: 3 }`.
 */
export function fenceBody(text: string): { start: number; end: number } {
  const lines = blockLines(text);
  const first = lines[0];
  if (first === undefined) {
    return { start: 0, end: 0 };
  }
  // A display formula may carry content on its own fence lines — `$$x$$` is a formula whose body
  // is `x` — where a code fence's first line holds its language rather than content.
  const formula = first.text.trimStart().startsWith('$$');
  const opening = formula
    ? first.text.length - first.text.trimStart().length + first.start + 2
    : first.start + first.text.length + 1;
  // The newline that ends the opening line belongs to *that* line: a formula whose `$$` has
  // nothing after it starts on the next line, and one with content there starts at the content.
  const start = Math.min(formula && text[opening] === '\n' ? opening + 1 : opening, text.length);
  const last = lines[lines.length - 1];
  const closedLine = lines.length > 1 && isDelimiterLine(last.text);
  const closedFrontmatter = lines.length > 1 && closesFrontmatter(last.text);
  const closedOnContent = formula && last.text.trimEnd().endsWith('$$') && last.text.length > 2;
  const end = closedLine || closedFrontmatter
    ? last.start
    : closedOnContent
      ? last.start + last.text.lastIndexOf('$$')
      : text.length;
  return { start, end: Math.max(start, end) };
}

/**
 * The language a fence names — `` ```js `` → `js` — or the empty string when it names none.
 *
 * Example: `'```python {#sample}'` returns `'python'`; `'```'` returns `''`.
 */
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

/**
 * Whether this line begins a new block, so it cannot continue the one above.
 *
 * Example: `'- item'` and `'# Heading'` return true; `'ordinary continuation'` returns false.
 */
export function startsBlock(line: string): boolean {
  return blockStartPattern.test(line);
}
