/**
 * Turns declared fenced-Div openings into remark container directives without
 * changing source offsets.
 *
 * Example: a classifier can turn `::: {.Theorem}` into `:::theorem   ` while
 * leaving an undeclared `::: {.columns}` unchanged.
 *
 * May import: marker rules, the complete-div reader and quote carriers. Upholds:
 * only complete, enclosed Div frames are rewritten and code/frontmatter/math
 * regions are skipped.
 */

import {
  closesFrontmatter,
  closingFence,
  frontmatterDelimiter,
  openingFence
} from '../markers';
import {
  readAttributedDivOpening,
  type AttributedFencedDivOpening
} from './divs';
import { quotePrefix } from './quote/lines';

interface SourceLine {
  start: number;
  end: number;
  text: string;
}

interface DivFrame {
  line: number;
  quoteDepth: number;
  fenceLength: number;
  parent: DivFrame | null;
  closed: boolean;
}

/** The directive name for a declared opening, or null for ordinary Div source. */
export type DivDirectiveReader = (
  opening: AttributedFencedDivOpening
) => string | null;

/** Rewrite every classified complete Div opening to an equal-length directive. */
export function divDirectivesForParsers(
  markdown: string,
  directiveFor: DivDirectiveReader
): string {
  const lines = sourceLines(markdown);
  if (lines.length === 0) {
    return markdown;
  }
  let frontmatter = frontmatterDelimiter(lines[0].text) !== null;
  let codeFence: string | null = null;
  let displayMath = false;
  const frames: DivFrame[] = [];
  const stack: DivFrame[] = [];
  const replacements: Array<{ start: number; end: number; text: string }> = [];

  for (const [index, line] of lines.entries()) {
    const quote = quotePrefix(line.text);
    const content = quote?.content ?? line.text;
    if (frontmatter) {
      if (line !== lines[0] && closesFrontmatter(content)) {
        frontmatter = false;
      }
      continue;
    }
    if (codeFence !== null) {
      if (closingFence(content, codeFence)) codeFence = null;
      continue;
    }
    const fence = openingFence(content);
    if (fence !== null) {
      codeFence = fence;
      continue;
    }
    if (displayMath) {
      if (content.trimEnd().endsWith('$$')) displayMath = false;
      continue;
    }
    if (content.trimStart().startsWith('$$')) {
      const first = content.indexOf('$$');
      const closesOnLine =
        content.indexOf('$$', first + 2) >= 0 && content.trimEnd().endsWith('$$');
      displayMath = !closesOnLine;
      continue;
    }

    const quoteDepth = quote?.depth ?? 0;
    while (stack.length > 0 && quoteDepth < stack[stack.length - 1].quoteDepth) {
      stack.pop();
    }
    const div = divFence(content);
    if (div === null) continue;
    const current = stack[stack.length - 1];
    if (div.closing) {
      if (
        current !== undefined &&
        quoteDepth === current.quoteDepth &&
        div.length >= current.fenceLength
      ) {
        current.closed = true;
        stack.pop();
      }
      continue;
    }
    const frame: DivFrame = {
      line: index,
      quoteDepth,
      fenceLength: div.length,
      parent: current ?? null,
      closed: false
    };
    frames.push(frame);
    stack.push(frame);
  }

  for (const frame of frames) {
    if (!frameIsClosed(frame)) continue;
    const line = lines[frame.line];
    const opening = readAttributedDivOpening(line.text);
    if (opening === null) continue;
    const directive = directiveFor(opening);
    if (directive === null) continue;
    const prefixLength =
      (opening.quotePrefix?.length ?? 0) + opening.fenceStart + opening.fenceLength;
    const prefix = line.text.slice(0, prefixLength);
    replacements.push({
      start: line.start,
      end: line.end,
      text: `${prefix}${directive}${' '.repeat(
        Math.max(0, line.text.length - prefix.length - directive.length)
      )}`
    });
  }

  let transformed = markdown;
  for (const replacement of replacements.reverse()) {
    transformed =
      transformed.slice(0, replacement.start) +
      replacement.text +
      transformed.slice(replacement.end);
  }
  return transformed;
}

function frameIsClosed(frame: DivFrame): boolean {
  for (let current: DivFrame | null = frame; current !== null; current = current.parent) {
    if (!current.closed) return false;
  }
  return true;
}

function divFence(content: string): { length: number; closing: boolean } | null {
  const match = /^ {0,3}(:{3,})(.*)$/.exec(content.trimEnd());
  if (match === null) return null;
  return { length: match[1].length, closing: match[2].trim() === '' };
}

function sourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  for (;;) {
    const newline = source.indexOf('\n', start);
    const end = newline < 0 ? source.length : newline;
    lines.push({ start, end, text: source.slice(start, end) });
    if (newline < 0) return lines;
    start = newline + 1;
  }
}
