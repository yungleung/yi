/**
 * Lowers Yi callouts into one semantic Pandoc fenced Div.
 *
 * GitHub alert syntax and authored fenced-Div syntax both become the same
 * `.callout` / `.callout-<kind>` wrapper with a visible `.callout-title`
 * child. The body keeps its Markdown and source order; only the callout's own
 * quote carrier is removed, while outer quote carriers remain around the
 * generated Div.
 *
 * May import: the block splitter and the callout syntax reader. Upholds: every
 * recognized callout has one filter-visible export shape and no Pandoc alerts
 * extension is required.
 */

import { splitBlocks } from '../markdown/document/blocks';
import {
  readCallout,
  type CalloutSource
} from '../markdown/syntax/callouts';

/** One source range and the semantic Div that replaces it. */
export interface CalloutRewrite {
  start: number;
  end: number;
  text: string;
}

/** Every callout in one export source, in document order. */
export function calloutRewrites(text: string): CalloutRewrite[] {
  const rewrites: CalloutRewrite[] = [];
  for (const block of splitBlocks(text)) {
    if (block.kind !== 'quote' && block.kind !== 'fencedDiv') {
      continue;
    }
    const callout = readCallout(block.text);
    if (callout === null) {
      continue;
    }
    rewrites.push({
      start: block.charStart,
      end: block.charEnd,
      text: calloutDiv(callout)
    });
  }
  return rewrites;
}

/** One callout as a fenced Div whose classes and title are stable for filters. */
export function calloutDiv(source: CalloutSource): string {
  const body = calloutBody(source);
  const fence = ':'.repeat(
    Math.max(4, longestDivFence(body) + 1)
  );
  const prefix = outerQuotePrefix(source);
  const attributes = attributeTokens(source);
  const lines = [
    `${fence} {${attributes.join(' ')}}`,
    '::: {.callout-title}',
    escapeMarkdownText(source.title),
    ':::'
  ];
  const bodyLines = body === '' ? [] : body.replace(/\n+$/, '').split('\n');
  if (bodyLines.length > 0) {
    lines.push('', ...bodyLines);
  }
  lines.push(fence);
  // The block slice ends before its newline, so the document's own line ending
  // after the closing fence is left in place.
  return lines.map((line) => prefixLine(prefix, line)).join('\n');
}

/** The body with the callout's own quote carriers removed. */
function calloutBody(source: CalloutSource): string {
  const lines = sourceLines(source.source);
  let start = 1;
  if (source.form === 'alert' && alertSeparator(lines[1])) {
    start = 2;
  }
  let end = source.form === 'div' ? lines.length - 1 : lines.length;
  if (end <= start) {
    return '';
  }
  return lines
    .slice(start, end)
    .map((line) => stripQuoteLevels(line.text, source.quoteDepth))
    .join('\n');
}

/** The quote levels outside the callout itself. */
function outerQuotePrefix(source: CalloutSource): string {
  if (source.form === 'div') {
    return source.quotePrefix;
  }
  const leading = /^ */u.exec(source.quotePrefix)?.[0] ?? '';
  const levels = source.quotePrefix.slice(leading.length).match(/> ?/gu) ?? [];
  return `${leading}${levels.slice(0, -1).join('')}`;
}

/** One generated line inside the surviving outer quote. */
function prefixLine(prefix: string, line: string): string {
  if (prefix === '') {
    return line;
  }
  return line === '' ? prefix.trimEnd() : `${prefix}${line}`;
}

/** The callout Div's identifier, classes and preserved key/value attributes. */
function attributeTokens(source: CalloutSource): string[] {
  const kindClass = `callout-${source.kind}`;
  const extra = source.classes.filter(
    (name) => name !== 'callout' && name !== kindClass
  );
  return [
    ...(source.id === null ? [] : [`#${source.id}`]),
    '.callout',
    `.${kindClass}`,
    ...extra.map((name) => `.${name}`),
    ...Object.entries(source.attributes).map(
      ([key, value]) => `${key}="${attributeValue(value)}"`
    )
  ];
}

/** The longest fenced-Div opener in a body, so the outer fence always encloses it. */
function longestDivFence(body: string): number {
  let longest = 0;
  for (const line of body.split('\n')) {
    const match = /^ {0,3}(:{3,})/.exec(line);
    if (match !== null) {
      longest = Math.max(longest, match[1].length);
    }
  }
  return longest;
}

/** Remove up to `depth` quote carriers while preserving the rest of the line. */
function stripQuoteLevels(line: string, depth: number): string {
  let at = 0;
  while (at < Math.min(3, line.length) && line[at] === ' ') {
    at += 1;
  }
  for (let level = 0; level < depth; level += 1) {
    if (line[at] !== '>') {
      break;
    }
    at += 1;
    if (line[at] === ' ') {
      at += 1;
    }
  }
  return line.slice(at);
}

/** Whether a line is the optional quoted separator after an alert marker. */
function alertSeparator(line: { text: string } | undefined): boolean {
  if (line === undefined) {
    return false;
  }
  return /^\s*>\s*$/u.test(line.text);
}

/** Escape the source title as Markdown text rather than inline markup. */
function escapeMarkdownText(text: string): string {
  return text.replace(/([\\`*_[\]{}<>#+\-!|])/g, '\\$1');
}

/** Escape one Pandoc attribute value. */
function attributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Lines of a callout source, with offsets relative to that source. */
function sourceLines(source: string): Array<{ start: number; end: number; text: string }> {
  const lines: Array<{ start: number; end: number; text: string }> = [];
  let start = 0;
  for (;;) {
    const newline = source.indexOf('\n', start);
    const stop = newline < 0 ? source.length : newline;
    const end = stop > start && source[stop - 1] === '\r' ? stop - 1 : stop;
    lines.push({ start, end, text: source.slice(start, end) });
    if (newline < 0) {
      return lines;
    }
    start = newline + 1;
  }
}
