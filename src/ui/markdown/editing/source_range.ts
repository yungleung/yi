/**
 * Finds the source range that can stand in for the caret's rendered node.
 *
 * Example: a caret in a link asks for the link's markdown range; a caret in a footnote's note
 * asks for no source, while one in the `[^label]` marker asks for exactly that prefix.
 *
 * May import: document state, source-mode block rules, the source-node registry, footnote marker
 * shape and mdast types. Upholds: the outermost source node containing the offset wins, and a
 * definition's note remains ordinary editable prose.
 */

import type { RootContent } from 'mdast';
import type { AstHeading } from '../ast';
import type { MarkdownEditorState } from '../document/state';
import { blockSourceAt } from '../source_mode';
import { showsSource } from '../registry';
import { markerShape } from '../syntax/footnote';

/**
 * The source a caret at this document offset is inside, as its own document range.
 *
 * A fenced block is selected whole while the caret is inside it and the reader is not selecting;
 * otherwise only a node whose source may replace its rendering is returned.
 */
export function sourceRangeAt(
  state: MarkdownEditorState,
  offset: number,
  selecting: boolean
): { from: number; to: number } | null {
  const block = state.getBlockAtOffset(offset);
  if (!block) {
    return null;
  }
  if (!selecting && blockSourceAt(block, offset)) {
    return { from: block.charStart, to: block.charEnd };
  }
  const range = sourceRangeIn(state.getBlockContent(block), offset - block.charStart);
  return range === null
    ? null
    : { from: block.charStart + range.start, to: block.charStart + range.end };
}

/**
 * The source at this block-relative offset as a range in the block's text, or null.
 *
 * The tree is walked in document order, so a caret inside a link inside a paragraph belongs to
 * the link. Example: offset 7 in `See [the note](target)` returns the link's range, not the
 * paragraph's.
 */
function sourceRangeIn(
  nodes: RootContent[],
  offset: number
): { start: number; end: number } | null {
  for (const node of nodes) {
    const position = (node as { position?: { start?: { offset?: number } } }).position;
    if (position?.start?.offset === undefined || offset < position.start.offset) {
      continue;
    }
    const end = (node as { position?: { end?: { offset?: number } } }).position?.end?.offset;
    if (end !== undefined && offset > end) {
      continue;
    }
    if (showsSource(node.type)) {
      return end === undefined ? null : { start: position.start.offset, end };
    }
    if (node.type === 'table' && node.tableCaption) {
      const caption = node.tableCaption.captionData;
      return offset >= caption.captionFrom && offset <= caption.captionTo
        ? { start: caption.captionFrom, end: caption.captionTo }
        : null;
    }
    if (node.type === 'list' && node.listCaption) {
      const caption = node.listCaption.captionData;
      if (offset >= caption.captionFrom && offset <= caption.captionTo) {
        return { start: caption.captionFrom, end: caption.captionTo };
      }
      return sourceRangeIn((node as { children?: RootContent[] }).children ?? [], offset);
    }
    if (node.type === 'footnoteDefinition') {
      const label = String((node as { label?: string }).label ?? '');
      const marker = markerShape(label);
      return offset < position.start.offset + marker.end
        ? { start: position.start.offset, end: position.start.offset + marker.end }
        : null;
    }
    if (node.type === 'heading') {
      const attributes = (node as AstHeading).headingAttributes;
      return attributes && end !== undefined && offset <= end
        ? { start: attributes.from, end: attributes.to }
        : null;
    }
    const children = (node as { children?: RootContent[] }).children;
    return Array.isArray(children) ? sourceRangeIn(children, offset) : null;
  }
  return null;
}
