/**
 * Reads GitHub alerts and Pandoc fenced-Div callouts into one positioned model.
 *
 * Example: `[!TIP]` at the start of a quote becomes
 * `{ form: 'alert', kind: 'tip', title: 'Tip', bodyFrom: … }`; the same
 * reader also resolves a complete `::: {.callout-warning title="Care"}` Div.
 *
 * May import: the Pandoc attribute grammar, fenced-Div ranges and the callout
 * model. Upholds: every body/marker offset names the original source, including
 * when the callout is nested inside quote carriers.
 */

import {
  attributeBlockAtEnd,
  type PandocAttributeBlock
} from './pandoc_attributes';
import { readFencedDiv } from './fenced_divs';
import {
  ALERT_MARKER,
  BUILTIN_TITLES,
  CALLOUT_CLASS,
  RESERVED_CALLOUT_CLASSES,
  humanizeKind,
  type BuiltinCalloutKind,
  type CalloutSource
} from './callout_model';

export interface SourceLine {
  start: number;
  end: number;
  text: string;
}

export interface QuoteLine extends SourceLine {
  depth: number;
  prefix: string;
  prefixEnd: number;
  content: string;
}

export interface DivOpening {
  fenceStart: number;
  fenceLength: number;
  attribute: PandocAttributeBlock;
  kind: string;
  builtin: boolean;
  title: string;
}

/** Read one complete callout from the start of `source`. */
export function readCallout(source: string, from = 0): CalloutSource | null {
  const lines = sourceLines(source);
  if (lines.length === 0) {
    return null;
  }
  return readAlertCallout(source, lines, from) ?? readDivCallout(source, lines, from);
}

/** The callout whose source range contains the block-relative offset. */
export function calloutAtOffset(source: string, offset: number): CalloutSource | null {
  const lines = sourceLines(source);
  let innermost: CalloutSource | null = null;
  for (const line of lines) {
    if (line.start > offset) {
      break;
    }
    if (!line.text.includes('[!') && !line.text.includes(':::')) {
      continue;
    }
    const callout = readCallout(source.slice(line.start));
    if (callout !== null && offset <= line.start + callout.to) {
      innermost = {
        ...callout,
        from: callout.from + line.start,
        to: callout.to + line.start,
        markerFrom: callout.markerFrom + line.start,
        markerTo: callout.markerTo + line.start,
        bodyFrom: callout.bodyFrom + line.start,
        bodyTo: callout.bodyTo + line.start,
        source
      };
    }
  }
  return innermost;
}

/** Where the first body character goes, or the block end for an empty body. */
export function calloutBodyInsertion(callout: CalloutSource | null): number {
  if (callout === null) {
    return 0;
  }
  return callout.bodyFrom;
}

/**
 * Whether a callout already owns a physical body line.
 *
 * A GitHub alert may end with an empty quoted carrier whose body offsets
 * collapse to its end. That line still exists, so typing on it must not
 * materialise a second one.
 */
export function calloutHasBody(callout: CalloutSource): boolean {
  if (callout.form === 'div') {
    return callout.bodyFrom < callout.bodyTo;
  }
  const afterMarker = callout.source.slice(callout.markerTo, callout.to);
  const firstBreak = afterMarker.indexOf('\n');
  return firstBreak >= 0 && afterMarker.slice(firstBreak + 1).length > 0;
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
      break;
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
  const bodyFirst = bodyStart <= last ? quoteLine(lines[bodyStart]) : null;
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
  const div = readFencedDiv(source);
  if (div === null) {
    return null;
  }
  return {
    form: 'div',
    kind: opening.kind,
    builtin: opening.builtin,
    title: opening.title,
    id: opening.attribute.id,
    classes: opening.attribute.classes,
    attributes: opening.attribute.attributes,
    from: from + div.from,
    to: from + div.to,
    markerFrom: from + div.markerFrom,
    markerTo: from + div.markerTo,
    bodyFrom: from + div.bodyFrom,
    bodyTo: from + div.bodyTo,
    quoteDepth: div.quoteDepth,
    quotePrefix: div.quotePrefix,
    source
  };
}

export function readDivOpening(line: SourceLine): DivOpening | null {
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

export function quoteLine(line: SourceLine): QuoteLine | null {
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

export function sourceLines(source: string): SourceLine[] {
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
