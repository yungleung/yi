/**
 * Projects mdast nodes between their rendered text length and raw document
 * ranges.
 *
 * Example: a citation renders `Smith (2020)` but occupies `[@smith2020]` in the
 * source; a footnote marker draws one character less than its raw label.
 *
 * May import: mdast node shapes, the block model, bibliography formatting and
 * footnote marker grammar. Upholds: every projection uses block-relative node
 * positions plus the current block character start.
 */

import type { RootContent } from 'mdast';
import { bibliographyManager } from '../../../services/bibliography';
import type { MarkdownBlock } from '../document/block';
import { markerShape } from '../syntax/footnote';

export function mapRenderedOffset(
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

function hasHiddenMarkers(node: RootContent, block: MarkdownBlock): boolean {
  if (node.type === 'list' || node.type === 'listItem' || node.type === 'blockquote') {
    return false;
  }
  const range = nodeRawRange(node, block);
  return range !== null && range.end - range.start > renderedLength(node);
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
  const length = (node as { value?: string }).value?.length ?? 0;
  if (renderedOffset <= acc + length) {
    const rawStart = rawStartOf(node, block);
    return rawStart === null ? null : rawStart + Math.max(0, renderedOffset - acc);
  }
  return null;
}

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

/** The characters a footnote's marker is drawn with: `[label]` for raw `[^label]`. */
export function drawnMarkerLength(node: {
  label?: string | null;
  identifier?: string | null;
}): number {
  return markerShape(String(node.label ?? node.identifier ?? '')).end - 1;
}

/** The rendered text length a node consumes (approximated for widgets). */
export function renderedLength(node: RootContent): number {
  if (node.type === 'text') {
    return node.value.length;
  }
  if (node.type === 'footnoteDefinition') {
    const children = (node as { children?: RootContent[] }).children ?? [];
    return (
      drawnMarkerLength(node) +
      children.reduce((sum, child) => sum + renderedLength(child), 0)
    );
  }
  if ('children' in node && Array.isArray(node.children)) {
    return (node.children as RootContent[]).reduce(
      (sum, child) => sum + renderedLength(child),
      0
    );
  }
  if (node.type === 'citation') {
    const value = (node as { value: string }).value;
    return bibliographyManager.formatCached(value)?.length ?? value.length;
  }
  if (node.type === 'footnoteReference') {
    return drawnMarkerLength(node);
  }
  return (node as { value?: string }).value?.length ?? 0;
}

function rawStartOf(node: RootContent, block: MarkdownBlock): number | null {
  const position = (
    node as { position?: { start: { offset?: number } } }
  ).position?.start.offset;
  if (position !== undefined) {
    if (node.type === 'code') {
      const newline = block.text.indexOf('\n');
      return (
        block.charStart +
        (newline >= 0 ? position + newline + 1 : position + block.text.length)
      );
    }
    return block.charStart + position;
  }
  if (node.type === 'text') {
    const index = block.text.indexOf(node.value);
    return index >= 0 ? block.charStart + index : null;
  }
  return null;
}

/** The node's absolute raw range in the document, or null when unknown. */
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
      return {
        start: block.charStart + index,
        end: block.charStart + index + node.value.length
      };
    }
  }
  return null;
}
