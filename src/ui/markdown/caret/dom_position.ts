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
import { SOURCE_SELECTOR, nodeRawRange, renderedLength } from './offsets';
import type { MarkdownBlock } from '../blocks';
import type { MarkdownEditorState } from '../state';
import { locateCell, readTableSource } from '../syntax/table_source';

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
    `.markdown-block[data-line-start="${block.lineStart}"]`
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
    const from = block.charStart + Number(source.dataset.sourceFrom ?? NaN);
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
      const textSpan = element.querySelector<HTMLElement>('[data-text-from]');
      const node = textSpan?.firstChild ?? element.querySelector('.markdown-table-placeholder')?.firstChild;
      if (node && node.nodeType === Node.TEXT_NODE) {
        const from = textSpan
          ? block.charStart + Number(textSpan.dataset.textFrom)
          : block.charStart + cell.contentStart;
        return { node, offset: Math.max(0, Math.min(clamped - from, (node as Text).data.length)) };
      }
      return { node: element, offset: 0 };
    }
  }
  // Plain text leaves tag their block-relative raw start: the global offset
  // is block.charStart + the tag. Exact at leaf boundaries too, where a flat
  // rendered offset would be ambiguous (e.g. between list items).
  for (const span of blockElement.querySelectorAll<HTMLElement>('[data-text-from]')) {
    const from = block.charStart + Number(span.dataset.textFrom);
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
  if (blockElement.textContent?.length === 0) {
    return { node: blockElement, offset: 0 };
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
