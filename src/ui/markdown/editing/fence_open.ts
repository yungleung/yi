/**
 * Opening a fenced block by typing its delimiter.
 *
 * A fenced block is two delimiter lines around a body, and typing the second delimiter's worth of
 * characters is how a reader asks for one: ` ``` `, `$$`, and — at the very top of a note — `---`.
 * What they would get otherwise is the one line they typed, which markdown reads as a fence running
 * to the end of the note: a ` ``` ` above a paragraph turns that paragraph into code, and a `$$`
 * turns it into the formula's content. So the line becomes both delimiters at once, with the blank
 * lines markdown needs around the block, which come from `blank_lines/` so nothing above or below
 * it is swallowed either. A formula or frontmatter caret lands in the body. Code and Div carets
 * stay after their opening markers: typed code-fence text filters the language choice, a following
 * space can begin Pandoc attributes, and a Div kind picker opens beside the colon fence. A Div waits
 * for a space after three or more colons, then retains that exact fence length on both lines.
 *
 * Only a delimiter of its own line opens anything, and only the very first line of the note opens
 * frontmatter: a `---` anywhere else is a thematic break, and stays one. A code fence's label asks
 * for its language the moment the block exists (`editing/language_picker.ts`), because a fence with
 * no language is the one thing about it the reader has not said yet.
 *
 * May import: the marker's home (`syntax/markers.ts`), the line spans beside it (`syntax/lines.ts`),
 * the blank-line rule (`./blank_lines`), the editing context and the language list's surface. Upholds:
 * the document text is the only source of truth — one `applyEdit` writes the block.
 */

import { soleDelimiter } from '../syntax/markers';
import { lineSpanAt } from '../syntax/lines';
import { getCaretRange } from '../caret/caret';
import { caretRect } from '../caret/geometry';
import { boxOf } from '../../floating';
import { blockPadding } from './blank_lines';
import { applyEdit, type EditorContext } from './context';
import { proseRoot } from './selection';
import { chooseLanguageAt } from './language_picker';
import { chooseDivKind } from './div_kind_picker';
import type { BlockKind, MarkdownBlock } from '../document/block';
import { readCallout } from '../syntax/callout';
import { readTheorem } from '../syntax/theorem';
import {
  fencedDivAtOffset,
  prefixInsertedBreaks,
  projectQuoteSource,
  quoteLineAt
} from '../syntax/container';

/** The blocks a typed delimiter opens. */
export type FenceOpenKind = Extract<
  BlockKind,
  'frontmatter' | 'fencedCode' | 'displayMath' | 'equation' | 'fencedDiv'
>;

/** What typing the last character of a delimiter line writes, in the document's own offsets. */
export interface FenceOpen {
  /** The block the line becomes. */
  kind: FenceOpenKind;
  /** The range of the document the block replaces: the delimiter line as it stood. */
  from: number;
  to: number;
  replacement: string;
  /** Where the caret lands: the opening marker, or a formula/frontmatter body line. */
  caret: number;
}

/**
 * The same opening rule inside a quote-bearing block, expressed in the
 * block-relative offsets the renderer and editor use here.
 */
export function containerFenceOpenWrite(
  text: string,
  at: number,
  typed: string
): FenceOpen | null {
  const quote = quoteLineAt(text, at);
  if (quote === null) {
    return fenceOpenWrite(text, at, typed);
  }
  const projected = projectQuoteSource(text);
  const projectedAt = projected.projectedOffsets[at] ?? projected.text.length;
  const write = fenceOpenWrite(projected.text, projectedAt, typed);
  if (write === null) {
    return null;
  }
  const from = projected.sourceOffsets[write.from] ?? at;
  const to = projected.sourceOffsets[write.to] ?? at;
  const prefix = text.slice(quote.start, quote.prefixEnd);
  const insertion = prefixInsertedBreaks(
    prefix,
    write.replacement,
    write.caret - write.from
  );
  return {
    kind: write.kind,
    from,
    to,
    replacement: insertion.replacement,
    caret: from + insertion.caret
  };
}

/**
 * What writing `typed` at `at` makes when it completes a delimiter line of its own, or null when
 * the characters are ordinary ones. `typed` is what the keystroke writes — a bracket's pair is
 * often two characters, and two backticks are the pair that completes a fence.
 */
export function fenceOpenWrite(
  text: string,
  at: number,
  typed: string
): FenceOpen | null {
  if (typed === '') {
    return null;
  }
  const caret = Math.max(0, Math.min(at, text.length));
  const line = lineSpanAt(text, caret);
  const lineText = text.slice(line.start, line.end);
  const within = caret - line.start;
  const beforeCaret = lineText.slice(0, within);
  const afterCaret = lineText.slice(within);
  const completed =
    beforeCaret + typed + afterCaret;
  const labeledEquation =
    completed === '[$$' ||
    completed === '[$$]' ||
    (beforeCaret + typed === '[$$' && afterCaret === ']') ||
    (lineText === '' && typed === '[$$');
  if (labeledEquation) {
    const { leading } = blockPadding(text, line.start);
    const { trailing } = blockPadding(text, line.end);
    return {
      kind: 'equation',
      from: line.start,
      to: line.end,
      replacement: `${leading}[$$\n\n$$]{}${trailing}`,
      caret: line.start + leading.length + '[$$\n'.length
    };
  }
  // What was typed is on this line, at its end: a delimiter typed over a selection, or in front of
  // text already there, is not a line of its own.
  if (caret !== line.end) {
    return null;
  }
  const div = /^( {0,3})(:{3,}) $/.exec(completed);
  if (typed === ' ' && div !== null) {
    const { leading } = blockPadding(text, line.start);
    const { trailing } = blockPadding(text, caret);
    const fence = div[2];
    const opening = fence;
    return {
      kind: 'fencedDiv',
      from: line.start,
      to: line.end,
      replacement: `${leading}${opening}\n\n${fence}${trailing}`,
      caret: line.start + leading.length + opening.length
    };
  }
  const delimiter = soleDelimiter(`${text.slice(line.start, line.end)}${typed}`);
  if (delimiter === null || delimiter[0] !== typed[0]) {
    return null;
  }
  // Frontmatter is the note's very first line: anywhere else `---` is a thematic break.
  if (delimiter === '---' && line.start !== 0) {
    return null;
  }
  const { leading } = blockPadding(text, line.start);
  const { trailing } = blockPadding(text, caret);
  const kind =
    delimiter === '$$'
      ? 'displayMath'
      : delimiter === '---'
        ? 'frontmatter'
        : 'fencedCode';
  const openingEnd = line.start + leading.length + delimiter.length;
  return {
    kind,
    from: line.start,
    to: line.end,
    replacement: `${leading}${delimiter}\n\n${delimiter}${trailing}`,
    caret: kind === 'fencedCode' ? openingEnd : openingEnd + 1
  };
}

/** Writes the block a typed delimiter opens, and asks for a code fence's language. */
export function insertFenceOpen(
  context: EditorContext,
  at: number,
  typed: string,
  block: MarkdownBlock | null
): boolean {
  const relative =
    block === null ? 0 : Math.min(Math.max(0, at - block.charStart), block.text.length);
  const containerRelative =
    block !== null && (block.kind === 'quote' || block.kind === 'fencedDiv');
  const write =
    containerRelative
      ? containerFenceOpenWrite(block.text, relative, typed)
      : fenceOpenWrite(context.state.getText(), at, typed);
  if (write === null) {
    return false;
  }
  const shift = containerRelative ? block.charStart : 0;
  const from = shift + write.from;
  const to = shift + write.to;
  const caret = shift + write.caret;
  applyEdit(context, from, to, write.replacement, caret, 'typing');
  if (write.kind === 'fencedCode') {
    askForLanguage(context, caret);
  } else if (write.kind === 'fencedDiv') {
    askForDivKind(context, caret);
  }
  return true;
}

/**
 * The language list for the fence just made: the list its own label opens, with `text` — a fence
 * naming no language — as the current answer. The block was rendered by the edit that made it, so
 * the label is found by the line the fence starts at.
 */
function askForLanguage(context: EditorContext, caret: number): void {
  const block =
    context.state.getBlockAtOffset(caret) ??
    context.state.getBlockAtOffset(Math.max(0, caret - 1));
  if (block === null) {
    return;
  }
  const label = proseRoot(context)?.querySelector<HTMLElement>(
    `.markdown-block[data-line-start="${block.lineStart}"] .markdown-fence-label`
  );
  if (label) {
    chooseLanguageAt(boxOf(label), '', block.lineStart, true);
    return;
  }
  const range = getCaretRange();
  const measured = range === null ? null : caretRect(range);
  chooseLanguageAt(
    measured
      ? {
          left: measured.left,
          top: measured.top,
          width: 0,
          height: measured.height
        }
      : null,
    '',
    block.lineStart,
    true
  );
}

/** Opens the grouped Div-kind list beside the caret that completed the Div. */
function askForDivKind(context: EditorContext, caret: number): void {
  const block =
    context.state.getBlockAtOffset(caret) ??
    context.state.getBlockAtOffset(Math.max(0, caret - 1));
  if (block === null) {
    return;
  }
  const source = proseRoot(context)?.querySelector<HTMLElement>(
    `.markdown-block[data-line-start="${block.lineStart}"] ` +
      '.markdown-callout-source, ' +
      `.markdown-block[data-line-start="${block.lineStart}"] .markdown-fenced-div-source, ` +
      `.markdown-block[data-line-start="${block.lineStart}"] .markdown-quote-source`
  );
  if (source) {
    const relative = Math.min(Math.max(0, caret - block.charStart), block.text.length);
    const div = fencedDivAtOffset(block.text, relative);
    const innerDiv = div === null ? null : block.text.slice(div.from, div.to);
    const innerCallout = innerDiv === null ? null : readCallout(innerDiv);
    const innerTheorem =
      innerDiv === null
        ? null
        : readTheorem(innerDiv, context.state.theoremVocabulary());
    const range = getCaretRange();
    const measured = range === null ? null : caretRect(range);
    const anchor = measured
      ? {
          left: measured.left,
          top: measured.top,
          width: 0,
          height: measured.height
        }
      : boxOf(source);
    chooseDivKind(
      anchor,
      innerTheorem === null
        ? innerCallout === null
          ? 'default'
          : `callout:${innerCallout.kind}`
        : `theorem:${innerTheorem.type.className}`,
      block.lineStart,
      context.state.theoremVocabulary()
    );
  }
}
