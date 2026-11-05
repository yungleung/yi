/**
 * Block-level source-mode rules and entry into exact source text.
 *
 * Example: a display-math block becomes its complete source while the caret is inside it; a click
 * on rendered KaTeX enters at `sourceEntryOffset(text)`.
 *
 * May import: block kinds, source syntax rules and the source-mode state. Upholds: only block kinds
 * that can hold exact source are selected, and containers reveal source only for their own range.
 */

import { hasSourceMode, type MarkdownBlock } from '../document/block';
import { hasGenericFencedDiv } from '../syntax/callout';
import { quoteNeedsSourceAt } from '../syntax/container';
import { fenceBody } from '../syntax/markers';
import { currentShownRange } from './state';

/** Whether this block is one that shows its own text. */
export function isSourceBlock(
  block: MarkdownBlock,
  recognizedTheorem = false
): boolean {
  if (
    !recognizedTheorem &&
    (block.kind === 'fencedDiv' || block.kind === 'quote') &&
    hasGenericFencedDiv(block.text)
  ) {
    return true;
  }
  if (!blockCanShowSource(block) || shownSourceWithinBlock(block) === null) {
    return false;
  }
  if (hasSourceMode(block.kind)) {
    return true;
  }
  const shown = currentShownRange();
  return shown?.from === block.charStart && shown.to === block.charEnd;
}

function blockCanShowSource(block: MarkdownBlock): boolean {
  return hasSourceMode(block.kind) || block.kind === 'quote' || block.kind === 'fencedDiv';
}

/** Whether the position inside this block needs the complete block source. */
export function blockSourceAt(block: MarkdownBlock, offset: number): boolean {
  if (hasSourceMode(block.kind)) {
    return true;
  }
  if (block.kind !== 'quote' && block.kind !== 'fencedDiv') {
    return false;
  }
  if (block.kind === 'fencedDiv') {
    return true;
  }
  const relative = Math.min(Math.max(0, offset - block.charStart), block.text.length);
  return quoteNeedsSourceAt(block.text, relative);
}

/** Where the shown source starts inside this block, or null when it is elsewhere. */
export function shownSourceWithinBlock(block: MarkdownBlock): number | null {
  const shown = currentShownRange();
  if (!shown || shown.from < block.charStart || shown.to > block.charEnd) {
    return null;
  }
  return shown.from - block.charStart;
}

/**
 * Where a click on rendered display math enters its source: the end of the last content line.
 *
 * Example: `$$\nx\n\n$$` enters after `x`, not before the closing delimiter.
 */
export function sourceEntryOffset(text: string): number {
  const body = fenceBody(text);
  let offset = body.end;
  while (offset > body.start && text[offset - 1] === '\n') {
    offset -= 1;
  }
  return offset;
}

let enterSource: ((blockElement: HTMLElement, offset: number | null) => void) | null = null;

/** Registers what entering a source means for this editor. */
export function setSourceEntryHandler(
  handler: ((blockElement: HTMLElement, offset: number | null) => void) | null
): void {
  enterSource = handler;
}

/** Enters the source containing an element, optionally at a block-relative offset. */
export function enterSourceOf(element: HTMLElement, offset: number | null = null): void {
  const blockElement = element.closest<HTMLElement>('.markdown-block');
  if (blockElement) {
    enterSource?.(blockElement, offset);
  }
}
