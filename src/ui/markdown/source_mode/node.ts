/**
 * Node-level source-mode questions.
 *
 * Example: a link asks `isShownSource(node)` while the caret is inside its markdown; a footnote
 * label asks `isShownSourceRange(start, end)` because only part of the definition node is shown.
 *
 * May import: AST types and source-mode state. Upholds: node source is the document's exact text
 * for the current render frame, never a serializer's canonical spelling.
 */

import type { AstNode } from '../ast';
import { currentShownRange, renderingBlock } from './state';

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

/** Whether the shown source covers exactly this block-relative range. */
export function isShownSourceRange(from: number, to: number): boolean {
  const frame = renderingBlock();
  const shown = currentShownRange();
  if (!frame || !shown) {
    return false;
  }
  return frame.charStart + from === shown.from && frame.charStart + to === shown.to;
}

/** The exact source text currently shown, or null outside a source render. */
export function shownSourceText(): string | null {
  const frame = renderingBlock();
  const shown = currentShownRange();
  if (!frame || !shown) {
    return null;
  }
  const from = shown.from - frame.charStart;
  const to = shown.to - frame.charStart;
  if (from < 0 || to < from || to > frame.text.length) {
    return null;
  }
  return frame.text.slice(from, to);
}
