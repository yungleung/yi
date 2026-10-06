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
import type { BlockKind } from '../document/block_kinds';

/** The blocks a typed delimiter opens. */
export type FenceOpenKind = Extract<BlockKind, 'frontmatter' | 'fencedCode' | 'displayMath'>;

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
  // What was typed is on this line, at its end: a delimiter typed over a selection, or in front of
  // text already there, is not a line of its own.
  if (caret !== line.end) {
    return null;
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
  const write = fenceOpenWrite(context.state.getText(), at, typed);
  if (write === null) {
    return false;
  }
  applyEdit(context, write.from, write.to, write.replacement, write.caret, 'typing');
  if (write.kind === 'fencedCode') {
    askForLanguage(context);
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
