/**
 * Source mode: showing the markdown something was made from, in place of its
 * rendering, while the caret is inside it.
 *
 * A display formula renders KaTeX, a link renders its title, a citation its
 * formatted reference, an image its picture — none of them holds the
 * characters the author typed, so none of them can hold a caret either: a
 * click cannot name the character it landed on, an edit cannot say what it
 * replaced, and a caret the editor restores has nowhere exact to go. While the
 * caret is inside one of them, that thing is therefore *built* as its own
 * source text: the shape an inline code span (or a fenced code block) always
 * has, where the element holds the text and the caret maps through it one to
 * one.
 *
 * The switch is a property of what is being built, never a swap inside a node
 * behind the caret. So nothing is recorded between renders — an edit, an undo
 * and a window change all rebuild from the document, and the shape is decided
 * again — and nothing has to be shifted, clamped or resumed:
 *
 * - a *block* asks whether the shown source lies in it (see `create_block.ts`
 *   and `virtual_block_renderer.ts`), which is how a display formula's block
 *   becomes its text;
 * - a *node* asks whether the shown source is its own, which it can do because
 *   the renderer names the block it is building (see `withRenderFrame`).
 *
 * What is held here is the range of the raw source being shown, in document
 * offsets. It follows the caret: the source the caret is inside is the one
 * being shown (see `editing/context.ts`).
 */

import type { AstNode } from './ast';
import { hasSourceMode, type MarkdownBlock } from './blocks';

/** The raw source being shown, as its range in the document, or null. */
let shownRange: { from: number; to: number } | null = null;

/** The block the renderer is building right now, or null (see `withRenderFrame`). */
let renderFrame: MarkdownBlock | null = null;

/**
 * Shows this range's own text, or no source at all. Returns whether that
 * changed, which is what tells the caller to render the blocks it affects.
 */
export function setShownRange(range: { from: number; to: number } | null): boolean {
  if ((range?.from ?? null) === (shownRange?.from ?? null) && (range?.to ?? null) === (shownRange?.to ?? null)) {
    return false;
  }
  shownRange = range;
  return true;
}

/** Whether this block is one that shows its own text. */
export function isSourceBlock(block: MarkdownBlock): boolean {
  return hasSourceMode(block.kind) && shownSourceWithinBlock(block) !== null;
}

/**
 * Where the shown source starts inside this block, or null when the shown
 * source is somewhere else. A block's rendering depends on it (a display
 * formula shows its text), which is also what tells the renderer that two
 * shapes of the same block are not the same element.
 */
export function shownSourceWithinBlock(block: MarkdownBlock): number | null {
  if (!shownRange || shownRange.from < block.charStart || shownRange.to > block.charEnd) {
    return null;
  }
  return shownRange.from - block.charStart;
}

/**
 * Builds a block with this block named as the one being built, so a node
 * inside it can ask whether its own source is the one being shown
 * (see {@link isShownSource}). The frame is what a node component needs and
 * cannot work out for itself: it is built inside a block it has no handle on.
 */
export function withRenderFrame<T>(block: MarkdownBlock, build: () => T): T {
  const previous = renderFrame;
  renderFrame = block;
  try {
    return build();
  } finally {
    renderFrame = previous;
  }
}

/** Whether this node's own source is the one being shown. */
export function isShownSource(node: AstNode): boolean {
  const frame = renderFrame;
  const position = (
    node as { position?: { start?: { offset?: number }; end?: { offset?: number } } }
  ).position;
  if (!frame || !shownRange || position?.start?.offset === undefined) {
    return false;
  }
  const from = frame.charStart + position.start.offset;
  const to = position.end?.offset === undefined ? from : frame.charStart + position.end.offset;
  return from === shownRange.from && to === shownRange.to;
}

/**
 * Where a click on a block's rendering enters its text: the end of the last
 * line that has content.
 *
 * The rendering cannot name a character, so the entry point is the one
 * position that is always true, and the author's next click lands on the text
 * itself, where the mapping is exact. The end of the *content* rather than the
 * end of the block: a block's closing delimiter — a formula's `$$` — is a line
 * of its own, and a character typed between it and the text above would glue
 * itself to the delimiter.
 */
export function sourceEntryOffset(text: string): number {
  const content = text.trimEnd();
  const closing = content.endsWith('$$') ? content.length - 2 : content.length;
  let offset = closing;
  while (offset > 0 && text[offset - 1] === '\n') {
    offset -= 1;
  }
  return offset;
}

/**
 * Puts the caret in a block's own text, or in a node's source inside it. The
 * editor owns the work: it is the only one that can turn an offset into a
 * caret. Without an offset the block's own text is entered at the end of its
 * content, which is what clicking a display formula's rendering asks for.
 */
let enterSource: ((blockElement: HTMLElement, offset: number | null) => void) | null = null;

/** Registers what entering a source means for this editor. */
export function setSourceEntryHandler(
  handler: ((blockElement: HTMLElement, offset: number | null) => void) | null
): void {
  enterSource = handler;
}

/**
 * Enters a source because the author clicked on its rendering: `offset` is the
 * place inside the block's text to put the caret at (block-relative), or null
 * to enter the block's own text at the end of its content.
 */
export function enterSourceOf(element: HTMLElement, offset: number | null = null): void {
  const blockElement = element.closest<HTMLElement>('.markdown-block');
  if (blockElement) {
    enterSource?.(blockElement, offset);
  }
}
