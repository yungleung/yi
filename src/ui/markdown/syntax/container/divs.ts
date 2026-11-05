/**
 * Reads complete Pandoc fenced Divs, whether or not they are callouts.
 *
 * A Div is a colon fence around a body. Pandoc lets nested Divs use a longer
 * fence, and a quoted Div keeps its blockquote carriers on every line. This
 * module owns those source ranges so block slicing, source mode and container
 * editing agree about where a Div starts, ends and accepts a body character.
 *
 * May import: the shared code-fence markers and quote-prefix reader. Upholds: only a complete,
 * balanced Div is returned, no colon line inside fenced code closes it, and
 * every range is an offset into the source it was read from.
 */

import { closingFence, openingFence } from '../markers';
import { quotePrefix } from './quote/lines';
import { attributeBlockAtEnd, type PandocAttributeBlock } from '../pandoc';

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

/** A complete fenced Div's source and editable ranges. */
export interface FencedDivSource {
  from: number;
  to: number;
  markerFrom: number;
  markerTo: number;
  bodyFrom: number;
  bodyTo: number;
  fenceLength: number;
  quoteDepth: number;
  quotePrefix: string;
  source: string;
}

/** A fenced Div opening with its Pandoc attributes and quote context. */
export interface AttributedFencedDivOpening {
  fenceStart: number;
  fenceLength: number;
  attribute: PandocAttributeBlock;
  quoteDepth: number;
  quotePrefix: string;
}

/** Read the attributes on one fenced-Div opening line. */
export function readAttributedDivOpening(
  line: string
): AttributedFencedDivOpening | null {
  const quote = quotePrefix(line);
  const content = quote?.content ?? line;
  const trimmed = content.trimEnd();
  const attribute = attributeBlockAtEnd(trimmed, trimmed.length, false);
  if (attribute === null) {
    const bare = /^( {0,3})(:{3,})\s+([A-Za-z][A-Za-z0-9_]*)\s*$/.exec(trimmed);
    if (bare === null) {
      return null;
    }
    return {
      fenceStart: bare[1].length,
      fenceLength: bare[2].length,
      attribute: {
        id: null,
        classes: [bare[3]],
        attributes: {},
        from: bare[1].length + bare[2].length,
        to: trimmed.length,
        source: '',
        separatorFrom: bare[1].length + bare[2].length,
        separator: ''
      },
      quoteDepth: quote?.depth ?? 0,
      quotePrefix: quote === null ? '' : line.slice(0, quote.prefixEnd)
    };
  }
  const before = trimmed.slice(0, attribute.from);
  const fence = /^( {0,3})(:{3,})\s*$/.exec(before);
  if (fence === null) {
    return null;
  }
  return {
    fenceStart: fence[1].length,
    fenceLength: fence[2].length,
    attribute,
    quoteDepth: quote?.depth ?? 0,
    quotePrefix: quote === null ? '' : line.slice(0, quote.prefixEnd)
  };
}

/** Read one complete fenced Div from the start of `source`. */
export function readFencedDiv(source: string): FencedDivSource | null {
  const lines = sourceLines(source);
  const first = lines[0];
  if (first === undefined) {
    return null;
  }
  const firstQuote = quoteLine(first);
  const openingContent = firstQuote?.content ?? first.text;
  const opening = divFence(openingContent);
  if (opening === null) {
    return null;
  }

  const quoteDepth = firstQuote?.depth ?? 0;
  const fenceStack = [opening.length];
  const code: CodeFence = { marker: null };
  let closing = -1;
  for (let index = 1; index < lines.length; index += 1) {
    const quote = quoteLine(lines[index]);
    if (quoteDepth > 0 && (quote === null || quote.depth < quoteDepth)) {
      return null;
    }
    const content = quote?.content ?? lines[index].text;
    if (insideCodeFence(content, code)) {
      continue;
    }
    const fence = divFence(content);
    if (fence === null) {
      continue;
    }
    const current = fenceStack[fenceStack.length - 1];
    if (fence.closing) {
      if (fence.length >= current) {
        if (
          fence.length > current &&
          closingFenceAhead(lines, index + 1, fence.length, quoteDepth)
        ) {
          fenceStack.push(fence.length);
          continue;
        }
        fenceStack.pop();
        if (fenceStack.length === 0) {
          closing = index;
          break;
        }
      }
      continue;
    }
    if (fence.length > current) {
      fenceStack.push(fence.length);
    }
  }
  if (closing < 0) {
    return null;
  }

  const last = lines[closing];
  const firstBody = lines[1];
  return {
    from: 0,
    to: last.end,
    markerFrom: firstQuote?.prefixEnd ?? 0,
    markerTo: first.end,
    bodyFrom: firstBody?.start ?? last.start,
    bodyTo: last.start,
    fenceLength: opening.length,
    quoteDepth,
    quotePrefix: firstQuote?.prefix ?? '',
    source
  };
}

/** Whether a longer bare fence is followed by its own matching bare fence. */
function closingFenceAhead(
  lines: SourceLine[],
  from: number,
  length: number,
  quoteDepth: number
): boolean {
  const code: CodeFence = { marker: null };
  for (let index = from; index < lines.length; index += 1) {
    const quote = quoteLine(lines[index]);
    if (quoteDepth > 0 && (quote === null || quote.depth < quoteDepth)) {
      return false;
    }
    const content = quote?.content ?? lines[index].text;
    if (insideCodeFence(content, code)) {
      continue;
    }
    const fence = divFence(content);
    if (
      fence?.closing === true &&
      quoteDepth === (quote?.depth ?? 0) &&
      fence.length >= length
    ) {
      return true;
    }
  }
  return false;
}

interface CodeFence {
  marker: string | null;
}

/** Whether this line belongs inside a fenced code block, updating its state. */
function insideCodeFence(content: string, code: CodeFence): boolean {
  if (code.marker !== null) {
    if (closingFence(content, code.marker)) {
      code.marker = null;
    }
    return true;
  }
  const opening = openingFence(content);
  if (opening !== null) {
    code.marker = opening;
    return true;
  }
  return false;
}

/** The innermost complete fenced Div containing a block-relative offset. */
export function fencedDivAtOffset(source: string, offset: number): FencedDivSource | null {
  const lines = sourceLines(source);
  const code: CodeFence = { marker: null };
  let innermost: FencedDivSource | null = null;
  for (const line of lines) {
    if (line.start > offset) {
      break;
    }
    const content = quoteLine(line)?.content ?? line.text;
    if (insideCodeFence(content, code)) {
      continue;
    }
    if (!line.text.includes(':::')) {
      continue;
    }
    const div = readFencedDiv(source.slice(line.start));
    if (div !== null && offset <= line.start + div.to) {
      innermost = {
        ...div,
        from: line.start,
        to: line.start + div.to,
        markerFrom: line.start + div.markerFrom,
        markerTo: line.start + div.markerTo,
        bodyFrom: line.start + div.bodyFrom,
        bodyTo: line.start + div.bodyTo,
        source
      };
    }
  }
  return innermost;
}

/** A Div fence in line content after any quote carrier. */
function divFence(content: string): { length: number; closing: boolean } | null {
  const match = /^ {0,3}(:{3,})(.*)$/.exec(content.trimEnd());
  if (match === null) {
    return null;
  }
  return { length: match[1].length, closing: match[2].trim() === '' };
}

function sourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  for (;;) {
    const newline = source.indexOf('\n', start);
    const end = newline < 0 ? source.length : newline;
    lines.push({ start, end, text: source.slice(start, end) });
    if (newline < 0) {
      return lines;
    }
    start = newline + 1;
  }
}

function quoteLine(line: SourceLine): QuoteLine | null {
  const prefix = quotePrefix(line.text);
  if (prefix === null) {
    return null;
  }
  return {
    ...line,
    depth: prefix.depth,
    prefix: line.text.slice(0, prefix.prefixEnd),
    prefixEnd: prefix.prefixEnd,
    content: prefix.content
  };
}
