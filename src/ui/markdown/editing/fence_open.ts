/**
 * Opening a fenced block by typing its delimiter.
 *
 * A fenced block is two delimiter lines around a body, and typing the second delimiter's worth of
 * characters is how a reader asks for one: ` ``` `, `$$`, and — at the very top of a note — `---`.
 * What they would get otherwise is the one line they typed, which markdown reads as a fence running
 * to the end of the note: a ` ``` ` above a paragraph turns that paragraph into code, and a `$$`
 * turns it into the formula's content. So the line becomes both delimiters at once, with the caret
 * on the blank line between them — the body the author is about to write in — and with the blank
 * lines markdown needs around the block, which come from `blank_lines.ts` so nothing above or below
 * it is swallowed either.
 *
 * Only a delimiter of its own line opens anything, and only the very first line of the note opens
 * frontmatter: a `---` anywhere else is a thematic break, and stays one. A code fence's label asks
 * for its language the moment the block exists (`editing/language_picker.ts`), because a fence with
 * no language is the one thing about it the reader has not said yet.
 *
 * May import: the marker's home (`syntax/markers.ts`), the line spans beside it (`syntax/lines.ts`),
 * the blank-line rule (`./blank_lines`), the editing context and the language list's surface. Upholds:
 * the document text is the only source of truth — one `applyEdit` writes the block, and the caret
 * lands on the blank line between the delimiters.
 */

import { soleDelimiter } from '../syntax/markers';
import { lineSpanAt } from '../syntax/lines';
import { blockPadding } from './blank_lines';
import { applyEdit, caretOffset, type EditorContext } from './context';
import { proseRoot } from './selection';
import { chooseLanguage } from './language_picker';
import { chooseCalloutKind } from './callout_kind_picker';
import type { BlockKind } from '../document/block_kinds';
import { calloutAtOffset } from '../syntax/callouts';
import {
  prefixInsertedBreaks,
  projectQuoteSource,
  quoteLineAt
} from '../syntax/quote_edits';

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
  /** Where the caret lands: the blank line between the delimiters. */
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
export function fenceOpenWrite(text: string, at: number, typed: string): FenceOpen | null {
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
  if (/^ {0,3}:{3}$/.test(completed)) {
    const { leading } = blockPadding(text, line.start);
    const { trailing } = blockPadding(text, caret);
    const opening = '::: {.callout .callout-note}';
    return {
      kind: 'fencedDiv',
      from: line.start,
      to: line.end,
      replacement: `${leading}${opening}\n\n:::${trailing}`,
      caret: line.start + leading.length + opening.length + 1
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
  return {
    kind: delimiter === '$$' ? 'displayMath' : delimiter === '---' ? 'frontmatter' : 'fencedCode',
    from: line.start,
    to: line.end,
    replacement: `${leading}${delimiter}\n\n${delimiter}${trailing}`,
    caret: line.start + leading.length + delimiter.length + 1
  };
}

/** Writes the block a typed delimiter opens, and asks for a code fence's language. */
export function insertFenceOpen(context: EditorContext, at: number, typed: string): boolean {
  const block = context.state.getBlockAtOffset(at);
  const relative =
    block === null ? 0 : Math.min(Math.max(0, at - block.charStart), block.text.length);
  const write =
    block !== null && (block.kind === 'quote' || block.kind === 'fencedDiv')
      ? containerFenceOpenWrite(block.text, relative, typed)
      : fenceOpenWrite(context.state.getText(), at, typed);
  if (write === null) {
    return false;
  }
  const from = block === null ? write.from : block.charStart + write.from;
  const to = block === null ? write.to : block.charStart + write.to;
  const caret = block === null ? write.caret : block.charStart + write.caret;
  applyEdit(context, from, to, write.replacement, caret, 'typing');
  if (write.kind === 'fencedCode') {
    askForLanguage(context);
  } else if (write.kind === 'fencedDiv') {
    askForCalloutKind(context);
  }
  return true;
}

/**
 * The language list for the fence just made: the list its own label opens, with `text` — a fence
 * naming no language — as the current answer. The block was rendered by the edit that made it, so
 * the label is found by the line the fence starts at.
 */
function askForLanguage(context: EditorContext): void {
  const caret = caretOffset(context);
  const block = caret === null ? null : context.state.getBlockAtOffset(caret);
  if (block === null) {
    return;
  }
  const label = proseRoot(context)?.querySelector<HTMLElement>(
    `.markdown-block[data-line-start="${block.lineStart}"] .markdown-fence-label`
  );
  if (label) {
    chooseLanguage(label, '', block.lineStart);
  }
}

/** Opens the callout-kind list beside the source of the Div just created. */
function askForCalloutKind(context: EditorContext): void {
  const caret = caretOffset(context);
  const block = caret === null ? null : context.state.getBlockAtOffset(caret);
  if (block === null) {
    return;
  }
  const source = proseRoot(context)?.querySelector<HTMLElement>(
    `.markdown-block[data-line-start="${block.lineStart}"] ` +
      '.markdown-callout-source, ' +
      `.markdown-block[data-line-start="${block.lineStart}"] .markdown-quote-source`
  );
  if (source) {
    const at = caret ?? block.charStart;
    const relative = Math.min(Math.max(0, at - block.charStart), block.text.length);
    chooseCalloutKind(
      source,
      calloutAtOffset(block.text, relative)?.kind ?? 'note',
      block.lineStart
    );
  }
}
