/**
 * Where a DOM position sits in the raw document: the caret, a selection
 * boundary, and the arithmetic both offset directions share.
 *
 * May import: the caret's range, the state and its blocks, the table's raw
 * source, the bibliography's cached citation text. Upholds: a rendered position
 * is derived from a document offset and re-derived after any rebuild — the
 * offset is the truth, and this is the half that reads a rendered position back
 * into one.
 *
 * The caret is a DOM range inside a rendered block; the block element carries
 * the block's line range and the state slices the block's mdast nodes out of the
 * whole-document parse. The caret's offset within the rendered text is mapped
 * back through those nodes: text leaves contribute their value (1:1 with the
 * source inside markers), and the hidden markers are skipped by using the
 * leaves' raw positions. Formatted widgets (citations, math, ...) are
 * approximated by their raw value length.
 *
 * Carets inside a revealed source span map through the span's tagged raw start,
 * which is block-relative: the document offset is the block's `charStart`
 * (refreshed on every edit) plus the block-relative position. Carets on blank
 * lines between blocks have no block and map to null.
 */

import type { MarkdownBlock } from '../document/blocks';
import type { MarkdownEditorState } from '../document/state';
import { projectQuoteSource } from '../syntax/quote_edits';
import { readTableSource } from '../syntax/table_source';
import { SOURCE_TEXT_SELECTOR } from '../source_text';
import { getCaretRange } from './caret';
import { LINE_START, TABLE_ROW_START, TEXT_FROM, offsetOf } from './../offset_tags';
import { mapRenderedOffset } from './node_projection';

export { drawnMarkerLength, nodeRawRange, renderedLength } from './node_projection';

export interface CaretLocation {
  /** The block containing the caret. */
  block: MarkdownBlock;
  /** Character offset in the whole document. */
  offset: number;
  /** Character offset relative to the block's start. */
  blockOffset: number;
}

/** The caret's location in the document, or null when it cannot be mapped. */
export function caretLocation(state: MarkdownEditorState): CaretLocation | null {
  const range = getCaretRange();
  if (!range) {
    return null;
  }
  return documentOffsetAt(state, range.startContainer, range.startOffset);
}

/**
 * A DOM position's location in the raw document, or null when it cannot be
 * mapped. Used for both the caret and the boundaries of a text selection.
 */
export function documentOffsetAt(
  state: MarkdownEditorState,
  container: Node,
  positionOffset: number
): CaretLocation | null {
  const containerNode = container;

  // Caret inside a revealed source: the span holds the raw-ish source and its
  // block-relative raw start was tagged when it was revealed.
  //
  // This comes before the text-node checks below because the caret need not be
  // in a text node at all: at the end of a line, or between the nodes a
  // highlighter produced, it sits on an element. Read over the span's own text
  // either way, so a highlighted source maps exactly as a plain one does.
  const sourceSpan = (
    containerNode.nodeType === Node.TEXT_NODE
      ? containerNode.parentElement
      : (containerNode as Element)
  )?.closest<HTMLElement>(SOURCE_TEXT_SELECTOR);
  if (sourceSpan) {
    const from = Number(sourceSpan.dataset.sourceFrom ?? NaN);
    const blockElement = sourceSpan.closest('.markdown-block') as HTMLElement | null;
    const block = blockElement
      ? state.getBlockAtLine(offsetOf(blockElement, LINE_START))
      : null;
    const within = sourceTextOffset(sourceSpan, containerNode, positionOffset);
    if (Number.isFinite(from) && block && within !== null) {
      // `from` is block-relative; the global offset is the block's char
      // start plus the block-relative position.
      const blockOffset = from + Math.min(within, sourceSpan.textContent?.length ?? 0);
      return { block, offset: block.charStart + blockOffset, blockOffset };
    }
  }

  if (containerNode.nodeType === Node.TEXT_NODE) {
    // A plain text leaf tags its block-relative raw start; the global offset
    // is the block's charStart (refreshed on every edit) plus the tag plus
    // the position inside the leaf. Exact at leaf boundaries too, where a
    // flat rendered offset would be ambiguous (e.g. between list items).
    // A caret inside an empty table cell has no tag of its own: the cell's
    // name (row:column) and the block's text say where its content starts.
    const tablePlaceholder = (containerNode.parentElement as HTMLElement | null)?.closest<HTMLElement>(
      '.markdown-table-placeholder'
    );
    const tableCell = tablePlaceholder?.closest<HTMLElement>('[data-table-cell]') ?? null;
    if (tablePlaceholder && tableCell) {
      const blockElement = tableCell.closest('.markdown-block') as HTMLElement | null;
      const block = blockElement
        ? state.getBlockAtLine(offsetOf(blockElement, LINE_START))
        : null;
      const hint = offsetOf(tableCell, TABLE_ROW_START);
      const [row, column] = (tableCell.dataset.tableCell ?? '').split(':').map(Number);
      const source = block
        ? readTableSource(block.text, Number.isFinite(hint) ? hint : undefined)
        : null;
      const span = source?.rows[row]?.cells[column];
      if (block && span) {
        return {
          block,
          offset: block.charStart + span.contentStart,
          blockOffset: span.contentStart
        };
      }
    }
    const textSpan = (containerNode.parentElement as HTMLElement | null)?.closest<HTMLElement>(
      `[data-${TEXT_FROM}]`
    );
    if (textSpan) {
      const from = offsetOf(textSpan, TEXT_FROM);
      const blockElement = textSpan.closest('.markdown-block') as HTMLElement | null;
      const block = blockElement
        ? state
            .getBlocks()
            .find((b) => String(b.lineStart) === blockElement.dataset.lineStart)
        : null;
      if (Number.isFinite(from) && block) {
        // A placeholder stands for a line with no characters of its own: the
        // caret can sit anywhere inside it, but every position maps to the
        // same raw offset (where its content would start), so typing stays on
        // that line instead of spilling into the next one.
        const placeholder =
          textSpan.textContent.length === 0 &&
          (textSpan.classList.contains('markdown-list-placeholder') ||
            textSpan.classList.contains('markdown-empty-line-placeholder'));
        // The tag names where the span's *text* starts, which need not be the
        // caret's own parent: a source shown highlighted is many nodes, and
        // every one of them counts from the span's beginning.
        const within = placeholder
          ? 0
          : textOffsetInElement(textSpan, containerNode, positionOffset) ?? positionOffset;
        const blockOffset = textSpan.matches(SOURCE_TEXT_SELECTOR)
          ? from + within
          : quoteProjectedOffset(block, from, within) ?? from + within;
        const offset = block.charStart + blockOffset;
        return { block, offset, blockOffset: offset - block.charStart };
      }
    }
  }

  const blockElement = closestBlockElement(containerNode);
  if (!blockElement) {
    return null;
  }
  const block = state
    .getBlocks()
    .find((b) => String(b.lineStart) === blockElement.dataset.lineStart);
  if (!block) {
    return null;
  }

  // An empty heading renders no text node, but its markers are still characters in the
  // document. A position on the heading element means the place after those markers;
  // mapping it through an empty rendering fails, and the next typed marker would vanish.
  if (
    (blockElement.matches('.markdown-heading') ||
      blockElement.querySelector('.markdown-heading') !== null) &&
    (blockElement.textContent ?? '').length === 0
  ) {
    return {
      block,
      offset: block.charEnd,
      blockOffset: block.charEnd - block.charStart
    };
  }

  const renderedOffset = textOffsetInElement(blockElement, containerNode, positionOffset);
  if (renderedOffset === null) {
    return null;
  }
  const offset = mapRenderedOffset(state.getBlockContent(block), block, renderedOffset);
  if (offset === null) {
    return null;
  }
  return { block, offset, blockOffset: offset - block.charStart };
}

/**
 * A rendered blockquote leaf omits every `>` carrier, while its source keeps
 * them. Its first line happens to line up; every later line does not. Project
 * the block's carriers away before adding the offset inside the leaf, then map
 * that projected position back to the source character.
 */
function quoteProjectedOffset(
  block: MarkdownBlock,
  from: number,
  within: number
): number | null {
  if (block.kind !== 'quote' && block.kind !== 'fencedDiv') {
    return null;
  }
  if (!block.text.split('\n').some((line) => /^\s*>/.test(line))) {
    return null;
  }
  const projected = projectQuoteSource(block.text);
  const start = projected.projectedOffsets[from];
  if (start === undefined) {
    return null;
  }
  return projected.sourceOffsets[start + within] ?? null;
}

function closestBlockElement(node: Node): HTMLElement | null {
  if (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches('.markdown-block')) {
    return node as HTMLElement;
  }
  return (node.parentElement?.closest('.markdown-block') as HTMLElement | null) ?? null;
}

/** The caret's offset within an element's rendered text content, or null. */
function textOffsetInElement(
  element: HTMLElement,
  container: Node,
  offset: number
): number | null {
  if (container.nodeType === Node.ELEMENT_NODE) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.setEnd(container, Math.min(offset, container.childNodes.length));
    let length = range.toString().length;
    // The word being composed is written into the line to be seen, and none of its
    // characters is in the document: it is stepped over here so that no offset in the block
    // is shifted by it (see `editing/composition_view.ts`).
    for (const composing of element.querySelectorAll('[data-composing], [data-chrome]')) {
      if (range.intersectsNode(composing)) {
        length -= composing.textContent?.length ?? 0;
      }
    }
    return length;
  }
  let acc = 0;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      isDrawn(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node === container) {
      return acc + offset;
    }
    acc += (node as Text).data.length;
  }
  return null;
}

/**
 * Whether this text is something the block *draws* that is not the document's own characters: the
 * word an input method is composing (`editing/composition_view.ts`), or a block's own chrome — the
 * label on a fenced block (`nodes/fence_label.ts`). Neither is the block's text, so neither is
 * counted: a caret anywhere in the block maps by the characters around them alone.
 */
function isDrawn(node: Node): boolean {
  const parent = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  return (parent?.closest('[data-composing], [data-chrome]') ?? null) !== null;
}

/**
 * A DOM boundary's character offset within a revealed source span.
 *
 * The source is one span, but not necessarily one text node: a formula's
 * source is highlighted into many. Everything that maps a caret inside a
 * revealed source goes through the span's own text, so the markup a highlight
 * adds is invisible to the mapping.
 */
export function sourceTextOffset(
  source: HTMLElement,
  container: Node,
  offset: number
): number | null {
  return textOffsetInElement(source, container, offset);
}
