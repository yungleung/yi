/**
 * Maps the current caret to its location in the raw document.
 *
 * The caret is a DOM range inside a rendered block; the block element carries
 * the block's line range and the state slices the block's mdast nodes out of
 * the whole-document parse. The caret's offset within the rendered text is
 * mapped back through those nodes: text leaves contribute their value
 * (1:1 with the source inside markers), and the hidden markers are skipped by
 * using the leaves' raw positions. Formatted widgets (citations, math, ...)
 * are approximated by their raw value length.
 *
 * Carets inside a revealed source span map through the span's tagged raw
 * start, which is block-relative: the document offset is the block's
 * `charStart` (refreshed on every edit) plus the block-relative position.
 * Carets on blank lines between blocks have no block and map to null.
 */

import type { RootContent } from 'mdast';
import { bibliographyManager } from '../../services/bibliography';
import { getCaretRange } from './caret/caret';
import type { MarkdownBlock } from './blocks';
import type { MarkdownEditorState } from './state';

export interface CaretLocation {
  /** The block containing the caret. */
  block: MarkdownBlock;
  /** Character offset in the whole document. */
  offset: number;
  /** Character offset relative to the block's start. */
  blockOffset: number;
}

const SOURCE_SELECTOR = [
  '.markdown-link-source',
  '.markdown-image-source',
  '.markdown-citation-source',
  '.markdown-wikilink-source',
  '.markdown-math-source',
  '.markdown-break-source',
  '.markdown-thematic-break-source'
].join(', ');

/** The caret's location in the document, or null when it cannot be mapped. */
export function caretLocation(state: MarkdownEditorState): CaretLocation | null {
  const range = getCaretRange();
  if (!range) {
    return null;
  }
  const container = range.startContainer;

  // Caret inside a revealed source: the span holds the raw-ish source and
  // its block-relative raw start was tagged when it was revealed.
  if (container.nodeType === Node.TEXT_NODE) {
    const sourceSpan = (container.parentElement as HTMLElement | null)?.closest<HTMLElement>(
      SOURCE_SELECTOR
    );
    if (sourceSpan) {
      const from = Number(sourceSpan.dataset.sourceFrom ?? NaN);
      const blockElement = sourceSpan.closest('.markdown-block') as HTMLElement | null;
      const block = blockElement
        ? state.getBlockAtLine(Number(blockElement.dataset.lineStart))
        : null;
      if (Number.isFinite(from) && block) {
        // `from` is block-relative; the global offset is the block's char
        // start plus the block-relative position.
        const blockOffset =
          from + Math.min(range.startOffset, sourceSpan.textContent?.length ?? 0);
        return { block, offset: block.charStart + blockOffset, blockOffset };
      }
    }
  }

  const blockElement = (container as Node).parentElement?.closest('.markdown-block') as
    | HTMLElement
    | null;
  if (!blockElement) {
    return null;
  }
  const block = state
    .getBlocks()
    .find((b) => String(b.lineStart) === blockElement.dataset.lineStart);
  if (!block) {
    return null;
  }

  const renderedOffset = textOffsetInElement(blockElement, container, range.startOffset);
  if (renderedOffset === null) {
    return null;
  }
  const offset = mapRenderedOffset(state.getBlockContent(block), block, renderedOffset);
  if (offset === null) {
    return null;
  }
  return { block, offset, blockOffset: offset - block.charStart };
}

/** The caret's offset within an element's rendered text content, or null. */
function textOffsetInElement(
  element: HTMLElement,
  container: Node,
  offset: number
): number | null {
  let acc = 0;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node === container) {
      return acc + offset;
    }
    acc += (node as Text).data.length;
  }
  return null;
}

/** Maps a rendered-text offset inside a block back to a document offset. */
function mapRenderedOffset(
  children: RootContent[],
  block: MarkdownBlock,
  renderedOffset: number
): number | null {
  let acc = 0;
  for (const child of children) {
    const mapped = mapNode(child, block, renderedOffset, acc);
    if (mapped !== null) {
      return mapped;
    }
    acc += renderedLength(child);
  }
  return null;
}

function mapNode(
  node: RootContent,
  block: MarkdownBlock,
  renderedOffset: number,
  acc: number
): number | null {
  if (node.type === 'text') {
    const length = node.value.length;
    if (renderedOffset <= acc + length) {
      const rawStart = rawStartOf(node, block);
      return rawStart === null ? null : rawStart + Math.max(0, renderedOffset - acc);
    }
    return null;
  }
  if ('children' in node && Array.isArray(node.children) && node.children.length > 0) {
    let inner = acc;
    for (const child of node.children as RootContent[]) {
      const mapped = mapNode(child, block, renderedOffset, inner);
      if (mapped !== null) {
        return mapped;
      }
      inner += renderedLength(child);
    }
    return null;
  }
  // A leaf without text children (citation, math, image, wikilink, break...):
  // the caret inside it maps into its raw source, approximated by value length.
  const length = (node as { value?: string }).value?.length ?? 0;
  if (renderedOffset <= acc + length) {
    const rawStart = rawStartOf(node, block);
    return rawStart === null ? null : rawStart + Math.max(0, renderedOffset - acc);
  }
  return null;
}

/** The rendered text length a node consumes (approximated for widgets). */
function renderedLength(node: RootContent): number {
  if (node.type === 'text') {
    return node.value.length;
  }
  if ('children' in node && Array.isArray(node.children)) {
    return (node.children as RootContent[]).reduce((sum, child) => sum + renderedLength(child), 0);
  }
  if (node.type === 'citation') {
    const value = (node as { value: string }).value;
    return bibliographyManager.formatCached(value)?.length ?? value.length;
  }
  return (node as { value?: string }).value?.length ?? 0;
}

/**
 * The node's raw start offset in the document, or null when unknown.
 *
 * Node positions come from the whole-document parse today, so they are
 * absolute. When blocks are parsed independently (per edit) the positions
 * become block-relative; this must then return `block.charStart + position`
 * to keep producing document offsets without maintaining global positions.
 */
function rawStartOf(node: RootContent, block: MarkdownBlock): number | null {
  const position = (
    node as { position?: { start: { offset?: number } } }
  ).position?.start.offset;
  if (position !== undefined) {
    return position;
  }
  // Position-less text (e.g. inside description lists): locate it in the
  // block's raw slice.
  if (node.type === 'text') {
    const index = block.text.indexOf(node.value);
    return index >= 0 ? block.charStart + index : null;
  }
  return null;
}
