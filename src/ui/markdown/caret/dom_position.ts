/**
 * The document offset as a position in the rendered tree: where the caret goes
 * after an edit or a rebuild.
 *
 * May import: the offset model (`./offsets`), the state and its blocks, the
 * table's raw source. Upholds: the mapping is re-derived from the offset
 * every time — never cached, never the other way round.
 *
 * The way *in* — a rendered position read back into a document offset — is
 * `offsets.ts`, beside this file.
 */

import type { RootContent } from 'mdast';
import { drawnMarkerLength, nodeRawRange, renderedLength, SOURCE_SELECTOR } from './offsets';
import { afterNewline } from './dom';
import type { MarkdownBlock } from '../document/blocks';
import type { MarkdownEditorState } from '../document/state';
import { locateCell, readTableSource } from '../syntax/table_source';
import { FORMAT_FROM, FORMAT_TO, LINE_START, SOURCE_FROM, TEXT_FROM, offsetOf } from './../offset_tags';

/** The text position a character offset inside a revealed source lands on. */
export function sourceTextPosition(source: HTMLElement, offset: number): DomPosition | null {
  return textNodeAtRenderedOffset(source, offset);
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
    `.markdown-block[data-${LINE_START}="${block.lineStart}"]`
  );
  if (!blockElement) {
    return null;
  }
  const clamped = Math.min(Math.max(offset, block.charStart), block.charEnd);
  // An offset inside a revealed source belongs to that source: it is the text
  // being edited, and its span carries the block-relative start of exactly that
  // text. Mapping through the rendered node instead would approximate the
  // position (a formula renders as KaTeX, not as its source) and the caret
  // would drift away from where the edit left it.
  for (const source of blockElement.querySelectorAll<HTMLElement>(SOURCE_SELECTOR)) {
    const from = block.charStart + offsetOf(source, SOURCE_FROM);
    if (!Number.isFinite(from)) {
      continue;
    }
    const length = source.textContent?.length ?? 0;
    // The caret belongs to this source when it is inside it — and, at its
    // edges, when it is a character or two outside: the raw text and the drawn
    // source can disagree by a marker, and at the end of an edit the caret sits
    // exactly there. Falling through to the block model instead would place the
    // caret by a rendering that is not the source at all, which puts it at the
    // start of the line.
    const atSource = clamped >= from && clamped <= from + length;
    const atSourceEdge = clamped >= from - 2 && clamped <= from + length + 2;
    if (atSource || atSourceEdge) {
      // The span's text, not its first child: a highlighted source is split
      // into as many text nodes as the highlighter needed.
      const position = sourceTextPosition(
        source,
        Math.max(0, Math.min(clamped - from, length))
      );
      if (position) {
        return position;
      }
    }
  }
  // A table cell is addressed by its name, not by a tag: the model says which
  // cell holds the offset, and the element with that name is its DOM. This is
  // also the only way into an empty cell, which has no text to walk to.
  const table = readTableSource(block.text, clamped - block.charStart);
  if (table) {
    const cell = locateCell(table, clamped - block.charStart);
    const element = cell
      ? blockElement.querySelector<HTMLElement>(`[data-table-cell="${cell.row}:${cell.column}"]`)
      : null;
    if (cell && element) {
      const textSpan = element.querySelector<HTMLElement>(`[data-${TEXT_FROM}]`);
      const node = textSpan?.firstChild ?? element.querySelector('.markdown-table-placeholder')?.firstChild;
      if (node && node.nodeType === Node.TEXT_NODE) {
        const from = textSpan
          ? block.charStart + offsetOf(textSpan, TEXT_FROM)
          : block.charStart + cell.contentStart;
        return { node, offset: Math.max(0, Math.min(clamped - from, (node as Text).data.length)) };
      }
      return { node: element, offset: 0 };
    }
  }
  // Plain text leaves tag their block-relative raw start: the global offset
  // is block.charStart + the tag. Exact at leaf boundaries too, where a flat
  // rendered offset would be ambiguous (e.g. between list items).
  for (const span of blockElement.querySelectorAll<HTMLElement>(`[data-${TEXT_FROM}]`)) {
    const from = block.charStart + offsetOf(span, TEXT_FROM);
    if (!Number.isFinite(from) || clamped < from) {
      continue;
    }
    // Over the span's whole text: a tagged leaf holds one text node, but a
    // block's source shown highlighted is spread over as many as the
    // highlighter needed.
    const position = textNodeAtRenderedOffset(span, clamped - from);
    if (position) {
      return position;
    }
  }
  // Raw offsets that fall on a formatted unit's markers (outside its text
  // leaves) resolve to the unit's rendered content edge, so the caret and
  // selection land on the visible text instead of the hidden markers.
  for (const unit of blockElement.querySelectorAll<HTMLElement>(`[data-${FORMAT_FROM}]`)) {
    const from = block.charStart + offsetOf(unit, FORMAT_FROM);
    const to = block.charStart + offsetOf(unit, FORMAT_TO);
    if (!Number.isFinite(from) || !Number.isFinite(to) || clamped < from || clamped > to) {
      continue;
    }
    const textSpans = unit.querySelectorAll<HTMLElement>(`[data-${TEXT_FROM}]`);
    const first = textSpans[0];
    const last = textSpans[textSpans.length - 1];
    if (first) {
      const firstNode = first.firstChild as Text;
      if (clamped <= block.charStart + offsetOf(first, TEXT_FROM)) {
        return { node: firstNode, offset: 0 };
      }
    }
    if (last) {
      const lastNode = last.firstChild as Text;
      const contentEnd = block.charStart + offsetOf(last, TEXT_FROM) + lastNode.data.length;
      if (clamped >= contentEnd) {
        return { node: lastNode, offset: lastNode.data.length };
      }
    }
  }
  if (blockElement.textContent?.length === 0) {
    // An empty heading still has a heading element to anchor beside. Using the
    // block wrapper makes a collapsed caret look like a block-edge drag to the
    // range reader, which resolves it before the heading's own offset rule.
    const heading = blockElement.querySelector<HTMLElement>('.markdown-heading');
    return { node: heading ?? blockElement, offset: 0 };
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
  if (node.type === 'footnoteDefinition') {
    // The label is drawn as the marker it is — `[1]` for `[^1]` — and the note's text
    // follows that drawing, so a raw offset inside the marker belongs to the label's own
    // characters and one past it belongs to the note (see `offsets.ts: mapNode`, the
    // other direction of this same rule).
    const drawn = drawnMarkerLength(node);
    if (rawOffset <= range.start + drawn) {
      return acc + Math.min(Math.max(rawOffset - range.start, 0), drawn);
    }
    return mapChildrenRawToRendered(
      node.children as RootContent[],
      block,
      rawOffset,
      acc + drawn
    );
  }
  if ('children' in node && Array.isArray(node.children) && node.children.length > 0) {
    return mapChildrenRawToRendered(node.children as RootContent[], block, rawOffset, acc);
  }
  // A leaf widget (citation, math, image, ...): clamp into its rendered
  // length, matching the forward mapping's approximation.
  const delta = Math.min(Math.max(rawOffset - range.start, 0), renderedLength(node));
  return acc + delta;
}

/** The rendered offset of a child list, after the offsets already counted before it. */
function mapChildrenRawToRendered(
  children: RootContent[],
  block: MarkdownBlock,
  rawOffset: number,
  acc: number
): number {
  let inner = acc;
  for (const child of children) {
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

/**
 * The text node holding a rendered-text offset inside a block, or null when
 * the offset cannot be resolved. KaTeX-generated text is skipped because the
 * rendered-length model treats math as its placeholder value.
 *
 * A boundary right after a newline belongs to the text that *follows* it: the position is the
 * start of the line below, and a caret anchored to the end of the text that holds the newline is
 * drawn on the line above instead (measured: typing a fence put the caret after the opening
 * ` ``` ` rather than on the blank body line it had been placed on).
 */
function textNodeAtRenderedOffset(
  blockElement: HTMLElement,
  renderedOffset: number
): DomPosition | null {
  // The text nodes that carry the offsets: KaTeX's own text is skipped, because the rendered-length
  // model treats math as its placeholder value.
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(blockElement, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node as Text;
    if (!text.parentElement?.closest('.katex')) {
      nodes.push(text);
    }
  }
  let acc = 0;
  for (let index = 0; index < nodes.length; index += 1) {
    const text = nodes[index];
    const end = acc + text.data.length;
    if (renderedOffset < end) {
      return { node: text, offset: Math.max(0, renderedOffset - acc) };
    }
    if (renderedOffset === end) {
      const next = nodes[index + 1];
      if (next !== undefined && afterNewline(text, text.data.length)) {
        return { node: next, offset: 0 };
      }
      return { node: text, offset: text.data.length };
    }
    acc = end;
  }
  return null;
}
