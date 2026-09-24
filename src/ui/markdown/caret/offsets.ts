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

import type { RootContent } from 'mdast';
import { bibliographyManager } from '../../../services/bibliography';
import type { MarkdownBlock } from '../document/blocks';
import type { MarkdownEditorState } from '../document/state';
import { markerShape } from '../syntax/footnotes';
import { readTableSource } from '../syntax/table_source';
import { getCaretRange } from './caret';

export interface CaretLocation {
  /** The block containing the caret. */
  block: MarkdownBlock;
  /** Character offset in the whole document. */
  offset: number;
  /** Character offset relative to the block's start. */
  blockOffset: number;
}

export const SOURCE_SELECTOR = [
  '.markdown-link-source',
  '.markdown-image-source',
  '.markdown-citation-source',
  '.markdown-wikilink-source',
  '.markdown-math-source',
  '.markdown-break-source',
  '.markdown-thematic-break-source',
  '.markdown-footnote-source'
].join(', ');

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
  )?.closest<HTMLElement>(SOURCE_SELECTOR);
  if (sourceSpan) {
    const from = Number(sourceSpan.dataset.sourceFrom ?? NaN);
    const blockElement = sourceSpan.closest('.markdown-block') as HTMLElement | null;
    const block = blockElement
      ? state.getBlockAtLine(Number(blockElement.dataset.lineStart))
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
        ? state.getBlockAtLine(Number(blockElement.dataset.lineStart))
        : null;
      const hint = Number(tableCell.dataset.tableRowStart);
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
      '[data-text-from]'
    );
    if (textSpan) {
      const from = Number(textSpan.dataset.textFrom);
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
          textSpan.classList.contains('markdown-list-placeholder') ||
          textSpan.classList.contains('markdown-empty-line-placeholder');
        // The tag names where the span's *text* starts, which need not be the
        // caret's own parent: a source shown highlighted is many nodes, and
        // every one of them counts from the span's beginning.
        const within = placeholder
          ? 0
          : textOffsetInElement(textSpan, containerNode, positionOffset) ?? positionOffset;
        const offset = block.charStart + from + within;
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
    return range.toString().length;
  }
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

/**
 * Whether a node's raw source is wider than what it renders to: a link, a
 * citation, a wikilink, math, an image, a break or a formatting span all hide
 * their markers. Containers are excluded — a list item's raw range starts at
 * its marker, which is not where a caret at the item's start belongs.
 */
function hasHiddenMarkers(node: RootContent, block: MarkdownBlock): boolean {
  if (node.type === 'list' || node.type === 'listItem' || node.type === 'blockquote') {
    return false;
  }
  const range = nodeRawRange(node, block);
  return range !== null && range.end - range.start > renderedLength(node);
}

/**
 * Maps a rendered-text offset inside a block back to a document offset.
 *
 * A rendered offset that sits exactly on the edge of a node with hidden
 * markers is that node's raw edge: the caret beside a citation, a wikilink,
 * math or a link belongs at the start or the end of its source rather than at
 * an offset guessed from the rendered length, which is what lets a selection
 * grown from such a boundary cover the whole source. Offsets strictly inside a
 * node keep the approximation.
 */
function mapRenderedOffset(
  children: RootContent[],
  block: MarkdownBlock,
  renderedOffset: number
): number | null {
  let acc = 0;
  let last: RootContent | null = null;
  for (const child of children) {
    if (renderedOffset <= acc && hasHiddenMarkers(child, block)) {
      const start = rawStartOf(child, block);
      if (start !== null) {
        return start;
      }
    }
    const mapped = mapNode(child, block, renderedOffset, acc);
    if (mapped !== null) {
      return mapped;
    }
    acc += renderedLength(child);
    last = child;
  }
  if (last && renderedOffset === acc && hasHiddenMarkers(last, block)) {
    const range = nodeRawRange(last, block);
    if (range) {
      return range.end;
    }
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
  if (node.type === 'footnoteDefinition') {
    // A definition draws its label as the marker the text holds — `[1]` for `[^1]`, a
    // character shorter — and its note after that. A caret *inside* the drawn label
    // belongs to the marker's own characters, which is what puts it in the source it
    // shows; the position just past the drawing is the note's own start.
    //
    // That last position is the `]: ` boundary, and it is the note's on purpose: the
    // drawn label is one character shorter than its source, so a caret at its right edge
    // has to land somewhere, and letting the label own it made one visual position mean
    // two things — a click in the gap right of the label wrote *into* it (a freshly
    // inserted note's `[^1]: ` came out `[^1H]: `) while a click on the note's own first
    // character, one pixel further along, wrote into the note. An empty note still has a
    // position to land on — the space markdown drops after `]:` is drawn as a character
    // of its own (`syntax/trailing_spaces.ts`) — and a definition with nothing in it at
    // all falls past the node, to the position right after it.
    const drawn = drawnMarkerLength(node);
    const rawStart = rawStartOf(node, block);
    if (rawStart !== null && renderedOffset < acc + drawn) {
      return rawStart + Math.max(renderedOffset - acc, 0);
    }
    return mapChildren(node.children as RootContent[], block, renderedOffset, acc + drawn);
  }
  if ('children' in node && Array.isArray(node.children) && node.children.length > 0) {
    return mapChildren(node.children as RootContent[], block, renderedOffset, acc);
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

/** The rendered offset of a child list, added to the offsets already counted. */
function mapChildren(
  children: RootContent[],
  block: MarkdownBlock,
  renderedOffset: number,
  acc: number
): number | null {
  let inner = acc;
  for (const child of children) {
    const mapped = mapNode(child, block, renderedOffset, inner);
    if (mapped !== null) {
      return mapped;
    }
    inner += renderedLength(child);
  }
  return null;
}

/**
 * The characters a footnote's marker is *drawn* with: `[label]` for the `[^label]` that
 * was written, one shorter (see `syntax/footnotes.ts: markerShape`). Both ends of a
 * footnote draw this shape, so both measure and map through it.
 */
export function drawnMarkerLength(node: { label?: string | null; identifier?: string | null }): number {
  return markerShape(String(node.label ?? node.identifier ?? '')).end - 1;
}

/** The rendered text length a node consumes (approximated for widgets). */
export function renderedLength(node: RootContent): number {
  if (node.type === 'text') {
    return node.value.length;
  }
  if (node.type === 'footnoteDefinition') {
    // The drawn label, then the note: counting only the note would make a caret that
    // walks into the label three characters into the note (`The first note.` came out
    // `ThXe first note.` while the label was drawn without this).
    const children = (node as { children?: RootContent[] }).children ?? [];
    return drawnMarkerLength(node) + children.reduce((sum, child) => sum + renderedLength(child), 0);
  }
  if ('children' in node && Array.isArray(node.children)) {
    return (node.children as RootContent[]).reduce((sum, child) => sum + renderedLength(child), 0);
  }
  if (node.type === 'citation') {
    const value = (node as { value: string }).value;
    return bibliographyManager.formatCached(value)?.length ?? value.length;
  }
  if (node.type === 'footnoteReference') {
    // The marker renders as `[label]`, and the caret has to be able to sit
    // after it: a marker counted as no width would pull the caret back in
    // front of itself, and the next marker typed would land on the wrong side.
    return drawnMarkerLength(node);
  }
  return (node as { value?: string }).value?.length ?? 0;
}

/**
 * The node's raw start offset in the document, or null when unknown.
 *
 * Node positions are block-relative (each block parses its own slice), so
 * the document offset is `block.charStart + position` — the block's char
 * start is refreshed on every edit, so no global positions are maintained.
 */
function rawStartOf(node: RootContent, block: MarkdownBlock): number | null {
  const position = (
    node as { position?: { start: { offset?: number } } }
  ).position?.start.offset;
  if (position !== undefined) {
    if (node.type === 'code') {
      // The rendered text is the code value, which starts after the opening
      // fence line (the first line of the block).
      const newline = block.text.indexOf('\n');
      return block.charStart + (newline >= 0 ? position + newline + 1 : position + block.text.length);
    }
    return block.charStart + position;
  }
  // Position-less text (e.g. inside description lists): locate it in the
  // block's raw slice.
  if (node.type === 'text') {
    const index = block.text.indexOf(node.value);
    return index >= 0 ? block.charStart + index : null;
  }
  return null;
}

/**
 * The node's absolute raw range in the document, or null when unknown.
 * Node positions are block-relative; the block's `charStart` (refreshed on
 * every edit) is added here. Position-less text (description lists) is
 * located in the block's slice.
 */
export function nodeRawRange(
  node: RootContent,
  block: MarkdownBlock
): { start: number; end: number } | null {
  const position = (
    node as { position?: { start: { offset?: number }; end: { offset?: number } } }
  ).position;
  if (position?.start.offset !== undefined && position.end.offset !== undefined) {
    if (node.type === 'code') {
      const newline = block.text.indexOf('\n');
      const valueStart =
        newline >= 0
          ? block.charStart + position.start.offset + newline + 1
          : block.charStart + position.start.offset + block.text.length;
      const value = (node as { value?: string }).value ?? '';
      return { start: valueStart, end: valueStart + value.length };
    }
    return {
      start: block.charStart + position.start.offset,
      end: block.charStart + position.end.offset
    };
  }
  if (node.type === 'text') {
    const index = block.text.indexOf(node.value);
    if (index >= 0) {
      return { start: block.charStart + index, end: block.charStart + index + node.value.length };
    }
  }
  return null;
}
