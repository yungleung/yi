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

  // Caret inside a revealed source: the span holds the raw-ish source and
  // its block-relative raw start was tagged when it was revealed.
  if (containerNode.nodeType === Node.TEXT_NODE) {
    const sourceSpan = (containerNode.parentElement as HTMLElement | null)?.closest<HTMLElement>(
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
          from + Math.min(positionOffset, sourceSpan.textContent?.length ?? 0);
        return { block, offset: block.charStart + blockOffset, blockOffset };
      }
    }
    // A plain text leaf tags its block-relative raw start; the global offset
    // is the block's charStart (refreshed on every edit) plus the tag plus
    // the position inside the leaf. Exact at leaf boundaries too, where a
    // flat rendered offset would be ambiguous (e.g. between list items).
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
        const offset = block.charStart + from + positionOffset;
        return { block, offset, blockOffset: offset - block.charStart };
      }
    }
  }

  const blockElement = (containerNode as Node).parentElement?.closest('.markdown-block') as
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

/** A DOM position resolved from a raw document offset. */
export interface DomPosition {
  node: Node;
  offset: number;
}

/**
 * Resolves a raw document offset to a DOM position inside the rendered
 * editor. The offset is mapped through the block's mdast positions to a
 * rendered-text offset, then to the matching text node. Offsets that fall on
 * hidden markers (e.g. the `**` of bold text) land on the rendered boundary
 * of the content they belong to, which is what caret restoration needs.
 */
export function domPositionAtOffset(
  state: MarkdownEditorState,
  root: HTMLElement,
  offset: number
): DomPosition | null {
  const block = state.getBlockAtOffset(offset);
  if (!block) {
    return null;
  }
  const blockElement = root.querySelector<HTMLElement>(
    `.markdown-block[data-line-start="${block.lineStart}"]`
  );
  if (!blockElement) {
    return null;
  }
  const clamped = Math.min(Math.max(offset, block.charStart), block.charEnd);
  // Plain text leaves tag their block-relative raw start: the global offset
  // is block.charStart + the tag. Exact at leaf boundaries too, where a flat
  // rendered offset would be ambiguous (e.g. between list items).
  for (const span of blockElement.querySelectorAll<HTMLElement>('[data-text-from]')) {
    const from = block.charStart + Number(span.dataset.textFrom);
    const text = span.firstChild;
    if (
      Number.isFinite(from) &&
      text !== null &&
      text.nodeType === Node.TEXT_NODE &&
      clamped >= from &&
      clamped <= from + (text as Text).data.length
    ) {
      return { node: text, offset: clamped - from };
    }
  }
  // Raw offsets that fall on a formatted unit's markers (outside its text
  // leaves) resolve to the unit's rendered content edge, so the caret and
  // selection land on the visible text instead of the hidden markers.
  for (const unit of blockElement.querySelectorAll<HTMLElement>('[data-format-from]')) {
    const from = block.charStart + Number(unit.dataset.formatFrom);
    const to = block.charStart + Number(unit.dataset.formatTo);
    if (!Number.isFinite(from) || !Number.isFinite(to) || clamped < from || clamped > to) {
      continue;
    }
    const textSpans = unit.querySelectorAll<HTMLElement>('[data-text-from]');
    const first = textSpans[0];
    const last = textSpans[textSpans.length - 1];
    if (first) {
      const firstNode = first.firstChild as Text;
      if (clamped <= block.charStart + Number(first.dataset.textFrom)) {
        return { node: firstNode, offset: 0 };
      }
    }
    if (last) {
      const lastNode = last.firstChild as Text;
      const contentEnd = block.charStart + Number(last.dataset.textFrom) + lastNode.data.length;
      if (clamped >= contentEnd) {
        return { node: lastNode, offset: lastNode.data.length };
      }
    }
  }
  // Widgets and other untagged positions fall back to the rendered-offset
  // model, which approximates the widget lengths.
  const rendered = renderedOffsetAtRaw(state.getBlockContent(block), block, clamped);
  if (rendered === null) {
    return null;
  }
  return textNodeAtRenderedOffset(blockElement, rendered);
}

/**
 * Maps a raw document offset to a rendered-text offset inside a block, by
 * walking the block's mdast content and using node positions to find where
 * the offset falls (skipping hidden markers).
 */
function renderedOffsetAtRaw(
  children: RootContent[],
  block: MarkdownBlock,
  rawOffset: number,
  acc = 0
): number | null {
  for (const child of children) {
    const range = nodeRawRange(child, block);
    if (!range) {
      acc += renderedLength(child);
      continue;
    }
    if (rawOffset < range.start) {
      return acc;
    }
    if (rawOffset <= range.end) {
      return mapNodeRawToRendered(child, block, rawOffset, acc);
    }
    acc += renderedLength(child);
  }
  return acc;
}

/** Maps an offset known to fall inside `node` to a rendered-text offset. */
function mapNodeRawToRendered(
  node: RootContent,
  block: MarkdownBlock,
  rawOffset: number,
  acc: number
): number {
  const range = nodeRawRange(node, block);
  if (!range) {
    return acc + renderedLength(node);
  }
  if (node.type === 'text') {
    const delta = Math.min(Math.max(rawOffset - range.start, 0), node.value.length);
    return acc + delta;
  }
  if ('children' in node && Array.isArray(node.children) && node.children.length > 0) {
    let inner = acc;
    for (const child of node.children as RootContent[]) {
      const childRange = nodeRawRange(child, block);
      if (childRange && rawOffset < childRange.start) {
        return inner;
      }
      if (childRange && rawOffset <= childRange.end) {
        return mapNodeRawToRendered(child, block, rawOffset, inner);
      }
      inner += renderedLength(child);
    }
    return inner;
  }
  // A leaf widget (citation, math, image, ...): clamp into its rendered
  // length, matching the forward mapping's approximation.
  const delta = Math.min(Math.max(rawOffset - range.start, 0), renderedLength(node));
  return acc + delta;
}

/**
 * The node's absolute raw range in the document, or null when unknown.
 * Node positions are block-relative; the block's `charStart` (refreshed on
 * every edit) is added here. Position-less text (description lists) is
 * located in the block's slice.
 */
function nodeRawRange(
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

/**
 * The text node holding a rendered-text offset inside a block, or null when
 * the offset cannot be resolved. KaTeX-generated text is skipped because the
 * rendered-length model treats math as its placeholder value.
 */
function textNodeAtRenderedOffset(
  blockElement: HTMLElement,
  renderedOffset: number
): DomPosition | null {
  let acc = 0;
  const walker = document.createTreeWalker(blockElement, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node as Text;
    if (text.parentElement?.closest('.katex')) {
      continue;
    }
    if (renderedOffset <= acc + text.data.length) {
      return { node: text, offset: Math.max(0, renderedOffset - acc) };
    }
    acc += text.data.length;
  }
  return null;
}
