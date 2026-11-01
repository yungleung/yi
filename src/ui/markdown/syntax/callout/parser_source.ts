/**
 * Turns callout fenced-Div openings into the directive spelling the remark
 * parser understands without changing source length.
 *
 * Example: `::: {.callout-tip}` becomes `::::callout-tip` plus spaces of the
 * same width, so every node offset still names the original document.
 *
 * May import: marker helpers, fenced-Div reading and callout source readers.
 * Upholds: frontmatter, code fences, display math and quote carriers are
 * skipped, and only a complete callout whose enclosing Divs also closed is
 * rewritten.
 */

import {
  closesFrontmatter,
  closingFence,
  frontmatterDelimiter,
  openingFence
} from '../markers';
import { readFencedDiv } from '../fenced_divs';
import {
  quoteLine,
  readCallout,
  readDivOpening,
  sourceLines,
  type DivOpening
} from './reader';

interface DivFrame {
  line: number;
  quoteDepth: number;
  fenceLength: number;
  opening: DivOpening | null;
  parent: DivFrame | null;
  closed: boolean;
}

/** The parser spelling of callout fenced Divs, with every source offset kept. */
export function calloutsForParsers(markdown: string): string {
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
    const quote = quoteLine(line);
    const content = quote?.content ?? line.text;

    if (frontmatter) {
      if (line !== lines[0] && closesFrontmatter(content)) {
        frontmatter = false;
      }
      continue;
    }

    if (codeFence !== null) {
      if (closingFence(content, codeFence)) {
        codeFence = null;
      }
      continue;
    }

    const fence = openingFence(content);
    if (fence !== null) {
      codeFence = fence;
      continue;
    }

    if (displayMath) {
      if (content.trimEnd().endsWith('$$')) {
        displayMath = false;
      }
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
    if (div === null) {
      continue;
    }
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
      opening: readDivOpening(line),
      parent: current ?? null,
      closed: false
    };
    frames.push(frame);
    stack.push(frame);
  }

  for (const frame of frames) {
    if (!frameIsClosed(frame) || frame.opening === null) {
      continue;
    }
    const line = lines[frame.line];
    const quote = quoteLine(line);
    const opening = frame.opening;
    const lineOffset = quote?.prefixEnd ?? 0;
    const prefix = line.text.slice(0, lineOffset + opening.fenceStart + opening.fenceLength);
    const directive = `callout-${opening.kind}`;
    replacements.push({
      start: line.start,
      end: line.end,
      text: `${prefix}${directive}${' '.repeat(Math.max(0, line.text.length - prefix.length - directive.length))}`
    });
  }

  let transformed = markdown;
  for (const replacement of [...replacements].reverse()) {
    transformed =
      transformed.slice(0, replacement.start) +
      replacement.text +
      transformed.slice(replacement.end);
  }
  return transformed;
}

/** Whether this source contains a complete fenced Div that is not a known callout. */
export function hasGenericFencedDiv(source: string): boolean {
  let codeFence: string | null = null;
  let displayMath = false;
  for (const line of sourceLines(source)) {
    const content = quoteLine(line)?.content ?? line.text;
    if (codeFence !== null) {
      if (closingFence(content, codeFence)) {
        codeFence = null;
      }
      continue;
    }
    const fence = openingFence(content);
    if (fence !== null) {
      codeFence = fence;
      continue;
    }
    if (displayMath) {
      if (content.trimEnd().endsWith('$$')) {
        displayMath = false;
      }
      continue;
    }
    if (content.trimStart().startsWith('$$')) {
      const first = content.indexOf('$$');
      const closesOnLine =
        content.indexOf('$$', first + 2) >= 0 && content.trimEnd().endsWith('$$');
      displayMath = !closesOnLine;
      continue;
    }
    if (!line.text.includes(':::')) {
      continue;
    }
    const slice = source.slice(line.start);
    if (readFencedDiv(slice) !== null && readCallout(slice) === null) {
      return true;
    }
  }
  return false;
}

/** A fenced Div is valid only when it and every enclosing fence closed. */
function frameIsClosed(frame: DivFrame): boolean {
  for (let current: DivFrame | null = frame; current !== null; current = current.parent) {
    if (!current.closed) {
      return false;
    }
  }
  return true;
}

/** A Div opening/closing fence in line content, after any quote carrier. */
function divFence(content: string): { length: number; closing: boolean } | null {
  const match = /^ {0,3}(:{3,})(.*)$/.exec(content.trimEnd());
  if (match === null) {
    return null;
  }
  return { length: match[1].length, closing: match[2].trim() === '' };
}
