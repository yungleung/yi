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
 *
 * May import: the registry (which node types show a source), the renderer's
 * rebuild, the editing context's offsets and the edit arithmetic
 * (`syntax/edit_range.ts`). Upholds: source mode is decided from the document —
 * the range shown is computed from the caret's offset, and the blocks that change
 * shape are rebuilt, so nothing ever swaps an element behind the caret.
 */

import type { AstNode } from './ast';
import { type MarkdownBlock } from './document/blocks';
import { hasSourceMode } from './document/block_kinds';;
import { calloutAtOffset } from './syntax/callouts';
import { shiftOffset, type TextEdit } from './syntax/edit_range';
import { fenceBody } from './syntax/markers';
import { quoteNeedsSourceAt } from './syntax/quote_edits';

/** The raw source being shown, as its range in the document, or null. */
let shownRange: { from: number; to: number } | null = null;

/** How many callers are holding the decision (see `withHeldShownSource`). */
let held = 0;

/** The block the renderer is building right now, or null (see `withRenderFrame`). */
let renderFrame: MarkdownBlock | null = null;

/**
 * Moves the shown range with an edit: it names document offsets, so an edit inside
 * it or before it moves it, and an edit after it does not.
 *
 * The plain-edit fast path calls this. It writes into a text node without deciding
 * the source again — the caret is still in the node it was in — and this is the
 * half of that decision an edit can still change: a deletion inside a block that
 * shows its own text would otherwise leave the range past the block's end.
 */
export function moveShownSource(edit: TextEdit): void {
  if (!shownRange) {
    return;
  }
  const from = shiftOffset(shownRange.from, edit);
  shownRange = { from, to: Math.max(from, shiftOffset(shownRange.to, edit)) };
}

/**
 * Holds the decision while `build` runs. What calls this knows the answer cannot
 * have changed — the caret is in the node it was in — and asking again would cost
 * the block's parse (see `editing/context.ts: showSourceAt`). A decision asked for
 * while held does nothing at all.
 */
export function withHeldShownSource<T>(build: () => T): T {
  held += 1;
  try {
    return build();
  } finally {
    held -= 1;
  }
}

/** Whether the shown source is held, which is what `showSourceAt` checks. */
export function shownSourceHeld(): boolean {
  return held > 0;
}

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
  if (!blockCanShowSource(block) || shownSourceWithinBlock(block) === null) {
    return false;
  }
  if (hasSourceMode(block.kind)) {
    return true;
  }
  // A quote or fenced Div also holds inline sources such as a footnote label.
  // Revealing one of those must leave the container rendered; only the
  // container's complete source range replaces it.
  return shownRange?.from === block.charStart && shownRange.to === block.charEnd;
}

/** Whether this block kind can be built as its own complete source. */
function blockCanShowSource(block: MarkdownBlock): boolean {
  return (
    hasSourceMode(block.kind) ||
    block.kind === 'quote' ||
    block.kind === 'fencedDiv'
  );
}

/** Whether the position inside this block needs the complete block source. */
export function blockSourceAt(block: MarkdownBlock, offset: number): boolean {
  if (hasSourceMode(block.kind)) {
    return true;
  }
  if (block.kind !== 'quote' && block.kind !== 'fencedDiv') {
    return false;
  }
  const relative = Math.min(Math.max(0, offset - block.charStart), block.text.length);
  return (
    calloutAtOffset(block.text, relative) !== null ||
    (block.kind === 'quote' && quoteNeedsSourceAt(block.text, relative))
  );
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

/**
 * The block whose element is being built right now, or null outside a render pass.
 *
 * A node component is built deep inside the renderer and has no handle on the block it sits in, and
 * some of what it draws is the block's *source* rather than its own node — a footnote draws the label
 * the author typed, which the parse normalises for matching and does not keep (`nodes/footnote.ts`).
 */
export function renderingBlock(): MarkdownBlock | null {
  return renderFrame;
}

/** Whether this node's own source is the one being shown. */
export function isShownSource(node: AstNode): boolean {
  const position = (
    node as { position?: { start?: { offset?: number }; end?: { offset?: number } } }
  ).position;
  if (position?.start?.offset === undefined) {
    return false;
  }
  const from = position.start.offset;
  return isShownSourceRange(from, position.end?.offset ?? from);
}

/**
 * Whether the shown source covers exactly this range of the block being built —
 * {@link isShownSource}'s question, asked of a range instead of a node.
 *
 * A node whose own markdown is only *part* of it asks this way, because its position
 * cannot say which part: a footnote definition's node covers the whole note, so its
 * label asks whether the source shown is the `[^label]` at the definition's head (see
 * `nodes/footnote.ts`).
 */
export function isShownSourceRange(from: number, to: number): boolean {
  const frame = renderFrame;
  if (!frame || !shownRange) {
    return false;
  }
  return frame.charStart + from === shownRange.from && frame.charStart + to === shownRange.to;
}

/**
 * The text of the source being shown, exactly as the block has it — the
 * author's own characters, not a re-serialization of the node.
 *
 * A source view *is* the text being edited, so it has to be the text in the
 * document. Markdown spells the same node more than one way (`* * *` and `***`
 * are both a rule, `[a](b 't')` and `[a](b "t")` are both a link with a title),
 * and the parser's canonical form can be a different length from what was
 * written — which puts the caret inside the marker rather than at its end, and
 * makes an edit land somewhere the author never pointed at.
 *
 * Null when no block is being built, in which case a caller has only the node
 * itself to read (see `revealable_node.ts`).
 */
export function shownSourceText(): string | null {
  const frame = renderFrame;
  if (!frame || !shownRange) {
    return null;
  }
  const from = shownRange.from - frame.charStart;
  const to = shownRange.to - frame.charStart;
  if (from < 0 || to < from || to > frame.text.length) {
    return null;
  }
  return frame.text.slice(from, to);
}

/**
 * Where a click on a display formula's rendering enters its text: the end of the formula's own last
 * content line.
 *
 * KaTeX cannot name a character — its glyphs say nothing about where in the source they were
 * written — so the entry point is the one position that is always true, and the author's next click
 * lands on the text itself, where the mapping is exact. It is the end of the *content*, which is
 * where a formula is still being written; the delimiter lines are drawn around it once the caret is
 * inside (`nodes/fence_text.ts`), so nothing has to be reached past to type.
 */
export function sourceEntryOffset(text: string): number {
  const body = fenceBody(text);
  // The end of the *content* rather than the end of the body: blank lines at the body's end are
  // not content, and a character typed between them and the closing delimiter would sit on a line
  // of its own between the two.
  let offset = body.end;
  while (offset > body.start && text[offset - 1] === '\n') {
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
