/**
 * Reads GitHub-style alerts and Pandoc fenced-Div callout source.
 *
 * GitHub syntax is a strict blockquote subtype. Fenced-Div syntax is explicit
 * Pandoc source. Both become one immutable model with exact source offsets;
 * this module also pads callout Div openings into directive syntax for the
 * remark parser without changing the string length.
 *
 * May import: the shared Pandoc attribute grammar and marker helpers. Upholds:
 * only the five built-in GitHub labels are implicit callouts, arbitrary kinds
 * need the explicit Div form, and parser preparation never moves an offset.
 */

import {
  attributeBlockAtEnd,
  type PandocAttributeBlock
} from './pandoc_attributes';
import {
  closesFrontmatter,
  closingFence,
  frontmatterDelimiter,
  openingFence
} from './markers';

export type BuiltinCalloutKind =
  | 'note'
  | 'tip'
  | 'important'
  | 'warning'
  | 'caution';

export interface CalloutSource {
  form: 'alert' | 'div';
  kind: string;
  builtin: boolean;
  title: string;
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  from: number;
  to: number;
  markerFrom: number;
  markerTo: number;
  bodyFrom: number;
  bodyTo: number;
  quoteDepth: number;
  quotePrefix: string;
  source: string;
}

interface SourceLine {
  start: number;
  end: number;
  text: string;
}

interface QuoteLine extends SourceLine {
  depth: number;
  prefix: string;
  prefixEnd: number;
  content: string;
}

interface DivOpening {
  fenceStart: number;
  fenceLength: number;
  attribute: PandocAttributeBlock;
  kind: string;
  builtin: boolean;
  title: string;
}

interface DivFrame {
  line: number;
  quoteDepth: number;
  fenceLength: number;
  opening: DivOpening | null;
  parent: DivFrame | null;
  closed: boolean;
}

const BUILTIN_TITLES: Record<BuiltinCalloutKind, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution'
};

const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i;
const CALLOUT_CLASS = /^callout-([a-z0-9][a-z0-9_-]*)$/;
const RESERVED_CALLOUT_CLASSES = new Set(['title', 'body']);

/** Read one complete callout from the start of `source`. */
export function readCallout(source: string, from = 0): CalloutSource | null {
  const lines = sourceLines(source);
  if (lines.length === 0) {
    return null;
  }
  return readAlertCallout(source, lines, from) ?? readDivCallout(source, lines, from);
}

/** Where the first body character goes, or the block end for an empty body. */
export function calloutBodyInsertion(callout: CalloutSource | null): number {
  if (callout === null) {
    return 0;
  }
  return callout.bodyFrom;
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

function readAlertCallout(
  source: string,
  lines: SourceLine[],
  from: number
): CalloutSource | null {
  const first = quoteLine(lines[0]);
  if (first === null) {
    return null;
  }
  const marker = ALERT_MARKER.exec(first.content);
  if (marker === null) {
    return null;
  }

  let last = 0;
  for (let index = 1; index < lines.length; index += 1) {
    const line = quoteLine(lines[index]);
    if (line === null) {
      if (lines[index].text.trim() !== '') {
        return null;
      }
      break;
    }
    if (line.depth < first.depth) {
      return null;
    }
    last = index;
  }

  let bodyStart = 1;
  const separator = bodyStart <= last ? quoteLine(lines[bodyStart]) : null;
  if (separator !== null && separator.content.trim() === '') {
    bodyStart = 2;
  }

  const markerStart = first.start + first.prefix.length;
  const kind = marker[1].toLowerCase() as BuiltinCalloutKind;
  const bodyFirst =
    bodyStart <= last ? quoteLine(lines[bodyStart]) : null;
  const bodyFrom =
    bodyFirst === null
      ? from + lines[last].end
      : from + bodyFirst.start + firstOuterPrefixEnd(bodyFirst);
  const bodyTo = from + lines[last].end;

  return {
    form: 'alert',
    kind,
    builtin: true,
    title: BUILTIN_TITLES[kind],
    id: null,
    classes: [],
    attributes: {},
    from,
    to: from + lines[last].end,
    markerFrom: from + markerStart,
    markerTo: from + markerStart + marker[0].trimEnd().length,
    bodyFrom,
    bodyTo,
    quoteDepth: first.depth,
    quotePrefix: first.prefix,
    source
  };
}

function readDivCallout(
  source: string,
  lines: SourceLine[],
  from: number
): CalloutSource | null {
  const opening = readDivOpening(lines[0]);
  if (opening === null) {
    return null;
  }
  const firstQuote = quoteLine(lines[0]);
  const depth = firstQuote?.depth ?? 0;
  const prefix = firstQuote?.prefix ?? '';

  let close = -1;
  for (let index = 1; index < lines.length; index += 1) {
    const quote = quoteLine(lines[index]);
    if (depth > 0 && (quote === null || quote.depth < depth)) {
      return null;
    }
    const content = quote?.content ?? lines[index].text;
    const match = /^\s*(:{3,})\s*$/.exec(content);
    if (match !== null && match[1].length >= opening.fenceLength) {
      close = index;
      break;
    }
  }
  if (close < 0) {
    return null;
  }

  const firstBody = lines[1];
  const closing = lines[close];
  return {
    form: 'div',
    kind: opening.kind,
    builtin: opening.builtin,
    title: opening.title,
    id: opening.attribute.id,
    classes: opening.attribute.classes,
    attributes: opening.attribute.attributes,
    from,
    to: from + closing.end,
    markerFrom: from + (firstQuote?.prefixEnd ?? 0),
    markerTo: from + lines[0].end,
    bodyFrom: from + (firstBody?.start ?? closing.start),
    bodyTo: from + closing.start,
    quoteDepth: depth,
    quotePrefix: prefix,
    source
  };
}

function readDivOpening(line: SourceLine): DivOpening | null {
  const quote = quoteLine(line);
  const content = quote?.content ?? line.text;
  const trimmed = content.trimEnd();
  const attribute = attributeBlockAtEnd(trimmed, trimmed.length, false);
  if (attribute === null) {
    return null;
  }
  const before = trimmed.slice(0, attribute.from);
  const fence = /^( {0,3})(:{3,})\s*$/.exec(before);
  if (fence === null) {
    return null;
  }

  const kinds = attribute.classes
    .map((name) => CALLOUT_CLASS.exec(name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1])
    .filter((kind) => !RESERVED_CALLOUT_CLASSES.has(kind));
  if (kinds.length !== 1) {
    return null;
  }
  const kind = kinds[0];
  const builtin = Object.prototype.hasOwnProperty.call(BUILTIN_TITLES, kind);
  const explicitTitle = attribute.attributes.title;
  return {
    fenceStart: fence[1].length,
    fenceLength: fence[2].length,
    attribute,
    kind,
    builtin,
    title:
      explicitTitle?.trim() ||
      (builtin ? BUILTIN_TITLES[kind as BuiltinCalloutKind] : humanizeKind(kind))
  };
}

function firstOuterPrefixEnd(line: QuoteLine): number {
  let end = 0;
  while (end < line.text.length - line.content.length && /\s/.test(line.text[end])) {
    end += 1;
  }
  if (line.text[end] === '>') {
    end += 1;
  }
  if (line.text[end] === ' ') {
    end += 1;
  }
  return end;
}

function quoteLine(line: SourceLine): QuoteLine | null {
  let index = 0;
  while (index < Math.min(3, line.text.length) && line.text[index] === ' ') {
    index += 1;
  }
  if (line.text[index] !== '>') {
    return null;
  }

  let depth = 0;
  while (line.text[index] === '>') {
    depth += 1;
    index += 1;
    if (line.text[index] === ' ') {
      index += 1;
    }
  }
  return {
    ...line,
    depth,
    prefix: line.text.slice(0, index),
    prefixEnd: index,
    content: line.text.slice(index)
  };
}

function humanizeKind(kind: string): string {
  return kind
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function sourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
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
