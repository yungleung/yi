/**
 * Multi-line container scans used by the block walker.
 *
 * Example: a fenced code block, a display formula, a quote, an HTML terminator
 * block or a complete fenced Div consumes every line it owns and returns the
 * next line for the outer scanner.
 *
 * May import: marker, equation and fenced-Div rules plus the source-line shape.
 * Upholds: each rule preserves the existing scan order and reports source-line
 * indexes only; seed construction and blank/list/paragraph merging stay outside.
 */

import {
  closingFence,
  htmlBlockTerminator,
  openingFence
} from '../../syntax/markers';
import { closesEquation, isEquationOpening } from '../../syntax/equation';
import { readFencedDiv } from '../../syntax/container';
import type { BlockKind } from './kinds';
import type { SourceLine } from './scanner';

export interface RuleScan {
  readonly kind: BlockKind;
  /** Index of the line whose end closes the block. */
  readonly last: number;
  /** Index at which the outer scanner continues. */
  readonly next: number;
}

/**
 * Scans the first container rule that owns the line at `index`.
 *
 * The order is semantic: code fences precede equations, equations precede
 * indented code, and a quote or fenced Div owns everything through its end.
 */
export function scanContainerBlock(
  text: string,
  lines: readonly SourceLine[],
  index: number
): RuleScan | null {
  return (
    scanFencedCode(lines, index) ??
    scanEquation(lines, index) ??
    scanDisplayMath(lines, index) ??
    scanIndentedCode(lines, index) ??
    scanHtml(lines, index) ??
    scanQuote(lines, index) ??
    scanFencedDiv(text, lines, index)
  );
}

function scanFencedCode(lines: readonly SourceLine[], index: number): RuleScan | null {
  const fence = openingFence(lines[index].text);
  if (fence === null) {
    return null;
  }
  let last = index;
  let next = index + 1;
  while (next < lines.length && !closingFence(lines[next].text, fence)) {
    last = next;
    next += 1;
  }
  if (next < lines.length) {
    last = next;
    next += 1;
  }
  return { kind: 'fencedCode', last, next };
}

function scanEquation(lines: readonly SourceLine[], index: number): RuleScan | null {
  if (!isEquationOpening(lines[index].text)) {
    return null;
  }
  for (let close = index + 1; close < lines.length; close += 1) {
    if (closesEquation(lines[close].text)) {
      return { kind: 'equation', last: close, next: close + 1 };
    }
  }
  return null;
}

function scanDisplayMath(lines: readonly SourceLine[], index: number): RuleScan | null {
  const first = lines[index].text;
  if (!first.trimStart().startsWith('$$')) {
    return null;
  }
  const open = first.indexOf('$$');
  const closesOnLine =
    first.indexOf('$$', open + 2) >= 0 && first.trimEnd().endsWith('$$');
  if (closesOnLine) {
    return { kind: 'displayMath', last: index, next: index + 1 };
  }
  let last = index;
  let next = index + 1;
  while (next < lines.length) {
    const candidate = lines[next].text;
    last = next;
    next += 1;
    if (candidate.trim().startsWith('$$') || candidate.trim().endsWith('$$')) {
      break;
    }
  }
  return { kind: 'displayMath', last, next };
}

function scanIndentedCode(lines: readonly SourceLine[], index: number): RuleScan | null {
  if (!/^(?: {4}|\t)/.test(lines[index].text)) {
    return null;
  }
  let last = index;
  let scan = index + 1;
  while (scan < lines.length) {
    while (scan < lines.length && lines[scan].text.trim() === '') {
      scan += 1;
    }
    if (scan >= lines.length || !/^(?: {4}|\t)/.test(lines[scan].text)) {
      break;
    }
    while (scan < lines.length && lines[scan].text.trim() !== '') {
      last = scan;
      scan += 1;
    }
  }
  return { kind: 'indentedCode', last, next: scan };
}

function scanHtml(lines: readonly SourceLine[], index: number): RuleScan | null {
  const terminator = htmlBlockTerminator(lines[index].text);
  if (terminator === null) {
    return null;
  }
  let last = index;
  let next = index + 1;
  while (next < lines.length && !terminator.test(lines[next].text)) {
    last = next;
    next += 1;
  }
  if (next < lines.length) {
    last = next;
    next += 1;
  }
  return { kind: 'html', last, next };
}

function scanQuote(lines: readonly SourceLine[], index: number): RuleScan | null {
  if (!isQuoteCarrier(lines[index].text)) {
    return null;
  }
  let last = index;
  let next = index + 1;
  while (next < lines.length && isQuoteCarrier(lines[next].text)) {
    last = next;
    next += 1;
  }
  return { kind: 'quote', last, next };
}

function scanFencedDiv(
  text: string,
  lines: readonly SourceLine[],
  index: number
): RuleScan | null {
  if (!lines[index].text.includes(':::')) {
    return null;
  }
  const charStart = lines[index].start;
  const div = readFencedDiv(text.slice(charStart));
  if (div === null || div.to <= 0) {
    return null;
  }
  const end = charStart + div.to;
  let last = index;
  let next = index;
  while (next < lines.length && lines[next].end <= end) {
    last = next;
    next += 1;
  }
  return { kind: 'fencedDiv', last, next };
}

function isQuoteCarrier(line: string): boolean {
  return /^ {0,3}>/.test(line);
}
