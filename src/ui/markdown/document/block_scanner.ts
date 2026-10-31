/**
 * Walks raw markdown lines and identifies block boundaries.
 *
 * Example: a paragraph followed immediately by ```` ``` ```` ends before the
 * fence, because markdown and the editor both treat the fence as its own block.
 *
 * May import: the pure syntax rules and the block kind vocabulary. Upholds: block
 * boundaries are a function of the source text alone.
 */

import {
  closesFrontmatter,
  closingFence,
  frontmatterDelimiter,
  htmlBlockTerminator,
  listMarker,
  openingFence
} from '../syntax/markers';
import { emptyParagraphIndexes, isEmptyParagraphLine } from '../syntax/blank_lines';
import { isTableCaptionLine } from '../syntax/table_captions';
import { listCaptionLine } from '../syntax/list_captions';
import { readTableSource } from '../syntax/table_source';
import { closesEquation, isEquationOpening } from '../syntax/equation_blocks';
import { readFencedDiv } from '../syntax/fenced_divs';
import type { BlockKind } from './block_kinds';

/** A line with its 1-based number and raw character range. */
export interface SourceLine {
  readonly number: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/**
 * What one block walk discovered before an index assigns live positions.
 *
 * Example: `{ kind: 'fencedCode', lineStart: 4, lineEnd: 9, ... }` describes
 * one fence; `Blocks` later makes its offsets derive from the shared index.
 */
export interface BlockSeed {
  readonly kind: BlockKind;
  readonly text: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly charStart: number;
  readonly charEnd: number;
}

/**
 * The lines of `text` from `start` on, numbered from `number`.
 *
 * Example: splitting `"a\nb"` from offset 2 with line number 5 returns line 5
 * containing `"b"`, which lets an incremental walk preserve absolute positions.
 */
export function splitLines(text: string, start = 0, number = 1): SourceLine[] {
  const out: SourceLine[] = [];
  let offset = start;
  let line = number;
  while (offset <= text.length) {
    const end = text.indexOf('\n', offset);
    const stop = end === -1 ? text.length : end;
    out.push({ number: line, start: offset, end: stop, text: text.slice(offset, stop) });
    if (end === -1) {
      break;
    }
    offset = end + 1;
    line += 1;
  }
  return out;
}

/**
 * The block seeds of `lines`, from `startIndex` on, in document order.
 *
 * A generator, because the caller may already have seen enough: a full split
 * drains it, and the re-split after an edit stops consuming it at the block the
 * document's own blocks come back. `blocksBefore` is how many blocks the
 * document already has above this walk, which the blank-line rule needs — a run
 * of blank lines opens the file only when nothing sits above it.
 */
export function* scanBlocks(
  text: string,
  lines: readonly SourceLine[],
  startIndex: number,
  blocksBefore: number
): Generator<BlockSeed> {
  let i = startIndex;

  // Frontmatter must start at the very first line of the document.
  if (startIndex === 0 && blocksBefore === 0) {
    if (frontmatterDelimiter(lines[0].text)) {
      const close = lines.findIndex((line, index) => index > 0 && closesFrontmatter(line.text));
      if (close >= 0) {
        const last = lines[close];
        yield {
          kind: 'frontmatter',
          lineStart: lines[0].number,
          lineEnd: last.number,
          charStart: lines[0].start,
          charEnd: last.end,
          text: text.slice(lines[0].start, last.end)
        };
        i = close + 1;
      }
    }
  }

  while (i < lines.length) {
    const first = lines[i];
    if (isEmptyParagraphLine(first.text)) {
      const runStart = i;
      while (i < lines.length && isEmptyParagraphLine(lines[i].text)) {
        i += 1;
      }
      // The final line of a file that ends with a newline is that newline's
      // doing, not a blank line the author wrote.
      const phantom = i === lines.length && text.endsWith('\n') ? 1 : 0;
      const run = lines.slice(runStart, i - phantom);
      const separator = (blocksBefore > 0 || runStart > startIndex) && i < lines.length;
      for (const index of emptyParagraphIndexes(run.length, separator)) {
        const line = run[index];
        yield {
          kind: 'blank',
          lineStart: line.number,
          lineEnd: line.number,
          charStart: line.start,
          charEnd: line.start,
          text: ''
        };
      }
      continue;
    }

    const lineStart = first.number;
    const charStart = first.start;
    let lineEnd = first.number;
    let charEnd = first.end;
    let j = i + 1;
    let kind: BlockKind = 'paragraph';

    // Fenced code: consume through the closing fence (or to the end).
    const fence = openingFence(first.text);
    if (fence) {
      kind = 'fencedCode';
      while (j < lines.length && !closingFence(lines[j].text, fence)) {
        lineEnd = lines[j].number;
        charEnd = lines[j].end;
        j += 1;
      }
      if (j < lines.length) {
        lineEnd = lines[j].number;
        charEnd = lines[j].end;
        j += 1;
      }
      yield makeSeed(kind, text, lineStart, lineEnd, charStart, charEnd);
      i = j;
      continue;
    }

    // Labeled display math: `[$$` through `$$]…`, one block including its attributes.
    if (isEquationOpening(first.text)) {
      let close = -1;
      for (let scan = j; scan < lines.length; scan += 1) {
        if (closesEquation(lines[scan].text)) {
          close = scan;
          break;
        }
      }
      if (close >= 0) {
        const last = lines[close];
        yield makeSeed('equation', text, lineStart, last.number, charStart, last.end);
        i = close + 1;
        continue;
      }
    }

    // Display math: `$$` on its own line through the closing `$$`.
    if (first.text.trimStart().startsWith('$$')) {
      kind = 'displayMath';
      const open = first.text.indexOf('$$');
      const closesOnLine =
        first.text.indexOf('$$', open + 2) >= 0 && first.text.trimEnd().endsWith('$$');
      if (!closesOnLine) {
        while (j < lines.length) {
          const candidate = lines[j].text;
          lineEnd = lines[j].number;
          charEnd = lines[j].end;
          j += 1;
          if (candidate.trim().startsWith('$$') || candidate.trim().endsWith('$$')) {
            break;
          }
        }
      }
      yield makeSeed(kind, text, lineStart, lineEnd, charStart, charEnd);
      i = j;
      continue;
    }

    // Indented code may contain blank lines (when followed by indented
    // lines), so an indented run continues across them.
    if (/^(?: {4}|\t)/.test(first.text)) {
      kind = 'indentedCode';
      let scan = j;
      while (scan < lines.length) {
        while (scan < lines.length && lines[scan].text.trim() === '') {
          scan += 1;
        }
        if (scan >= lines.length) {
          break;
        }
        if (!/^(?: {4}|\t)/.test(lines[scan].text)) {
          break;
        }
        while (scan < lines.length && lines[scan].text.trim() !== '') {
          lineEnd = lines[scan].number;
          charEnd = lines[scan].end;
          scan += 1;
        }
      }
      if (scan > j) {
        j = scan;
      }
      yield makeSeed(kind, text, lineStart, lineEnd, charStart, charEnd);
      i = j;
      continue;
    }

    // HTML blocks that continue until a terminator (script/pre/style/
    // textarea, comments, processing instructions, declarations, CDATA) may
    // contain blank lines; consume them whole so one block maps to one
    // `html` node.
    const htmlTerminator = htmlBlockTerminator(first.text);
    if (htmlTerminator) {
      kind = 'html';
      while (j < lines.length && !htmlTerminator.test(lines[j].text)) {
        lineEnd = lines[j].number;
        charEnd = lines[j].end;
        j += 1;
      }
      if (j < lines.length) {
        lineEnd = lines[j].number;
        charEnd = lines[j].end;
        j += 1;
      }
      yield makeSeed(kind, text, lineStart, lineEnd, charStart, charEnd);
      i = j;
      continue;
    }

    // Blockquotes carry Markdown container prefixes that cannot be split into
    // ordinary paragraphs: quoted blank lines (`>`) belong to the same quote,
    // and an ordinary blank line without the carrier ends it.
    if (isQuoteCarrier(first.text)) {
      kind = 'quote';
      while (j < lines.length && isQuoteCarrier(lines[j].text)) {
        lineEnd = lines[j].number;
        charEnd = lines[j].end;
        j += 1;
      }
      yield makeSeed(kind, text, lineStart, lineEnd, charStart, charEnd);
      i = j;
      continue;
    }

    // A fenced Div must be one block even when its body has ordinary blank
    // lines or nested Divs. `readFencedDiv` proves that every fence closes for
    // the source after this line.
    if (first.text.includes(':::')) {
      const div = readFencedDiv(text.slice(charStart));
      if (div !== null && div.to > 0) {
        const end = charStart + div.to;
        let close = i;
        while (close < lines.length && lines[close].end <= end) {
          lineEnd = lines[close].number;
          charEnd = lines[close].end;
          close += 1;
        }
        yield makeSeed('fencedDiv', text, lineStart, lineEnd, charStart, charEnd);
        i = close;
        continue;
      }
    }

    // A run of consecutive non-blank lines — which stops before a fence or a display formula.
    //
    // Both may interrupt a paragraph, and markdown reads them as blocks when they do (`text\n```\n`
    // is a paragraph and then a code block; `text\n$$\n` is a paragraph and then a formula). They
    // also *have* to be blocks here: a fence's and a formula's own text is the shape the app shows
    // while the caret is inside them (`block_kinds.ts: hasSourceMode`), and a formula folded into a
    // paragraph is one whose source cannot be shown at all — measured, a click on it in
    // `notes/Game Theory/6 Bayesian Game.md` entered the paragraph's text and no source appeared.
    while (
      j < lines.length &&
      lines[j].text.trim() !== '' &&
      openingFence(lines[j].text) === null &&
      !isEquationOpening(lines[j].text) &&
      !lines[j].text.trimStart().startsWith('$$')
    ) {
      lineEnd = lines[j].number;
      charEnd = lines[j].end;
      j += 1;
    }

    // Pandoc's table caption may sit directly below the last row or after one
    // blank line. Keep that caption in the table's block so the two are parsed
    // together. Two or more blank lines end the association; the colon line is
    // then ordinary source and must not be consumed by description-list repair.
    if (j < lines.length && lines[j].text.trim() === '') {
      let captionLine = j;
      while (captionLine < lines.length && lines[captionLine].text.trim() === '') {
        captionLine += 1;
      }
      const tableText = text.slice(charStart, lines[j].start);
      const table = readTableSource(tableText);
      const isWholeTable =
        table !== null && table.from === 0 && tableText.slice(table.to).trim() === '';
      if (
        isWholeTable &&
        captionLine < lines.length &&
        isTableCaptionLine(lines[captionLine].text.trimStart())
      ) {
        const blankLines = captionLine - j;
        if (blankLines === 1) {
          lineEnd = lines[captionLine].number;
          charEnd = lines[captionLine].end;
          i = captionLine + 1;
          yield makeSeed('paragraph', text, lineStart, lineEnd, charStart, charEnd);
          continue;
        }
        i = j;
        yield makeSeed('paragraph', text, lineStart, lineEnd, charStart, charEnd);
        continue;
      }
    }

    // Loose lists may contain blank lines between items (and indented item
    // continuations after a blank), so a run that starts with a list marker
    // continues across blank lines while the next content still belongs to
    // the list. This keeps one list = one block, matching the mdast tree.
    const list = listMarker(first.text);
    let listMerged = false;
    if (list) {
      let scan = j;
      let mergedEnd = j;
      while (scan < lines.length) {
        const blankStart = scan;
        while (scan < lines.length && isEmptyParagraphLine(lines[scan].text)) {
          scan += 1;
        }
        const phantom = scan === lines.length && text.endsWith('\n') ? 1 : 0;
        // A run that renders an empty paragraph is a block boundary: the list
        // ends there and the empty paragraph becomes a block of its own.
        if (scan - blankStart - phantom > 1) {
          break;
        }
        if (scan >= lines.length) {
          break;
        }
        const info = listMarker(lines[scan].text);
        const sameLevel =
          info !== null && info.indent === list.indent && info.ordered === list.ordered;
        const indented = /^(?: {2,}|\t)/.test(lines[scan].text);
        if (!sameLevel && !indented) {
          break;
        }
        listMerged = true;
        while (scan < lines.length && !isEmptyParagraphLine(lines[scan].text)) {
          lineEnd = lines[scan].number;
          charEnd = lines[scan].end;
          scan += 1;
        }
        mergedEnd = scan;
      }
      if (listMerged) {
        j = mergedEnd;
      }
    }

    // A list caption may follow after one blank line. Keep it in the list's
    // block; two or more blank lines end the association and leave the colon
    // line to ordinary Markdown parsing.
    if (list && j < lines.length && lines[j].text.trim() === '') {
      let captionLine = j;
      while (captionLine < lines.length && lines[captionLine].text.trim() === '') {
        captionLine += 1;
      }
      const indent = ' '.repeat(list.indent);
      const candidate = lines[captionLine];
      const caption =
        candidate !== undefined &&
        candidate.text.startsWith(indent) &&
        listCaptionLine(candidate.text.slice(indent.length), 0) !== null;
      if (caption && captionLine === j + 1) {
        lineEnd = candidate.number;
        charEnd = candidate.end;
        i = captionLine + 1;
        yield makeSeed('paragraph', text, lineStart, lineEnd, charStart, charEnd);
        continue;
      }
      if (caption) {
        i = j;
        yield makeSeed('paragraph', text, lineStart, lineEnd, charStart, charEnd);
        continue;
      }
    }

    // Description lists: remark-deflist merges every consecutive `term` +
    // `: details` pair (separated by blank lines) into a single description
    // list, so the block must span them all to slice cleanly from the
    // whole-document tree.
    let scan = j;
    let mergedEnd = j;
    let sawDetails = false;
    while (scan < lines.length) {
      while (scan < lines.length && lines[scan].text.trim() === '') {
        scan += 1;
      }
      if (scan >= lines.length) {
        break;
      }
      if (/^:\s+/.test(lines[scan].text.trimStart())) {
        sawDetails = true;
        while (scan < lines.length && lines[scan].text.trim() !== '') {
          lineEnd = lines[scan].number;
          charEnd = lines[scan].end;
          scan += 1;
        }
        mergedEnd = scan;
        continue;
      }
      // Before the first `: details` the run is not a description list; a
      // plain run (e.g. a footnote definition) must stay its own block.
      if (!sawDetails) {
        break;
      }
      // A non-details line continues the list when it is a term: a run of
      // non-blank lines followed (after blanks) by `: details`.
      const termStart = scan;
      while (scan < lines.length && lines[scan].text.trim() !== '') {
        scan += 1;
      }
      let probe = scan;
      while (probe < lines.length && lines[probe].text.trim() === '') {
        probe += 1;
      }
      if (probe < lines.length && /^:\s+/.test(lines[probe].text.trimStart())) {
        for (let k = termStart; k < scan; k += 1) {
          lineEnd = lines[k].number;
          charEnd = lines[k].end;
        }
        continue;
      }
      break; // not a term: the description list ends here
    }
    if (sawDetails) {
      kind = 'descriptionList';
      i = mergedEnd;
    } else {
      i = j;
    }

    yield makeSeed(kind, text, lineStart, lineEnd, charStart, charEnd);
  }
}

/** Builds one block seed from its source range. */
function makeSeed(
  kind: BlockKind,
  text: string,
  lineStart: number,
  lineEnd: number,
  charStart: number,
  charEnd: number
): BlockSeed {
  return { kind, lineStart, lineEnd, charStart, charEnd, text: text.slice(charStart, charEnd) };
}

/** Whether a line carries one blockquote level. */
function isQuoteCarrier(line: string): boolean {
  return /^ {0,3}>/.test(line);
}
