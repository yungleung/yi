/**
 * Left/right caret traversal across text, void leaves, revealed sources and
 * adjacent callout bodies.
 *
 * Example: stepping right out of a link enters the next callout at its first
 * body character, and stepping into `[label](url)` source skips its marker.
 *
 * May import: caret/DOM leaf helpers, offset tags and the neighbor-node rules.
 * Upholds: horizontal movement lands on a real text or void boundary in the
 * nearby window, never on generated chrome.
 */

import {
  afterNewline,
  collapsed,
  firstTextNodeIn,
  isVoidElement,
  lastTextNodeIn,
  lineTopOf,
  nextPositionNode,
  previousPositionNode,
  rangeAfter,
  rangeBefore,
  sameLineTop
} from '../dom';
import { CALLOUT_BODY_ANCHOR, CONTENT_START } from '../../offset_tags';
import {
  firstNavigableNodeIn,
  lastNavigableNodeIn
} from './nodes';

export function moveHorizontally(
  range: Range,
  direction: -1 | 1,
  blocks: readonly HTMLElement[]
): Range | null {
  return direction < 0 ? moveLeft(range, blocks) : moveRight(range, blocks);
}

function moveLeft(range: Range, blocks: readonly HTMLElement[]): Range | null {
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const text = range.startContainer as Text;
    if (range.startOffset > 0) {
      return collapsed(text, range.startOffset - 1);
    }
    return endOfPreviousText(text, 0, blocks);
  }

  const element = range.startContainer as Element;
  const before =
    range.startOffset > 0 ? element.childNodes[range.startOffset - 1] : null;
  if (before?.nodeType === Node.TEXT_NODE) {
    return collapsed(before as Text, Math.max(0, (before as Text).data.length - 1));
  }
  if (before?.nodeType === Node.ELEMENT_NODE) {
    const lastText = lastTextNodeIn(before as Element);
    if (lastText) {
      return collapsed(
        lastText,
        sourceRightEntryOffset(revealedSourceRange(lastText), lastText.data.length)
      );
    }
  }
  return endOfPreviousText(before ?? element, 0, blocks);
}

function moveRight(range: Range, blocks: readonly HTMLElement[]): Range | null {
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const text = range.startContainer as Text;
    if (range.startOffset < text.data.length) {
      return collapsed(text, range.startOffset + 1);
    }
    return startOfNextText(text, text.data.length, blocks);
  }

  const element = range.startContainer as Element;
  const offset = range.startOffset;
  const after = offset < element.childNodes.length ? element.childNodes[offset] : null;
  if (after?.nodeType === Node.TEXT_NODE) {
    return collapsed(after as Text, Math.min(1, (after as Text).data.length));
  }
  if (after?.nodeType === Node.ELEMENT_NODE) {
    const firstText = firstTextNodeIn(after as Element);
    if (firstText) {
      return collapsed(
        firstText,
        sourceLeftEntryOffset(revealedSourceRange(firstText), firstText.data.length)
      );
    }
  }
  if (after) {
    return startOfNextText(after, 0, blocks);
  }
  return startOfNextText(element.lastChild ?? element, 0, blocks);
}

function revealedSourceRange(text: Text): { start: number; end: number } | null {
  const span = text.parentElement?.closest(`[data-${CONTENT_START}]`) as HTMLElement | null;
  if (!span) {
    return null;
  }
  const start = Number(span.dataset.contentStart);
  const end = Number(span.dataset.contentEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return { start, end };
}

function sourceLeftEntryOffset(
  range: { start: number; end: number } | null,
  length: number
): number {
  if (range && range.start > 0) {
    return range.start;
  }
  return Math.min(1, length);
}

function sourceRightEntryOffset(
  range: { start: number; end: number } | null,
  length: number
): number {
  if (range && (range.end < length || range.start > 0)) {
    return range.end;
  }
  return Math.max(0, length - 1);
}

function endOfPreviousText(
  node: Node,
  offset: number,
  blocks: readonly HTMLElement[]
): Range | null {
  const callout = adjacentCalloutRange(node, blocks, -1);
  if (callout) {
    return callout;
  }
  if (node.nodeType === Node.ELEMENT_NODE && isVoidElement(node)) {
    return rangeBefore(node as Element);
  }
  const previous = previousPositionNode(node, blocks);
  if (!previous) {
    return null;
  }
  const currentTop = lineTopOf(node, offset);
  if (previous.nodeType === Node.TEXT_NODE) {
    const text = previous as Text;
    const end = text.data.length;
    const sameLine = sameLineTop(currentTop, lineTopOf(text, end));
    if (sameLine) {
      return collapsed(text, sourceRightEntryOffset(revealedSourceRange(text), end));
    }
    return collapsed(text, afterNewline(text, end) ? end - 1 : end);
  }
  const rect = (previous as Element).getBoundingClientRect();
  const sameLine = sameLineTop(currentTop, rect.height > 0 ? rect.top : null);
  return sameLine ? rangeBefore(previous as Element) : rangeAfter(previous as Element);
}

function startOfNextText(
  node: Node,
  offset: number,
  blocks: readonly HTMLElement[]
): Range | null {
  const callout = adjacentCalloutRange(node, blocks, 1);
  if (callout) {
    return callout;
  }
  if (node.nodeType === Node.ELEMENT_NODE && isVoidElement(node)) {
    return rangeAfter(node as Element);
  }
  const next = nextPositionNode(node, blocks);
  if (!next) {
    return null;
  }
  const currentTop = lineTopOf(node, offset);
  if (next.nodeType === Node.TEXT_NODE) {
    const text = next as Text;
    const sameLine = sameLineTop(currentTop, lineTopOf(text, 0));
    return collapsed(
      text,
      sameLine
        ? sourceLeftEntryOffset(revealedSourceRange(text), text.data.length)
        : 0
    );
  }
  const rect = (next as Element).getBoundingClientRect();
  const sameLine = sameLineTop(currentTop, rect.height > 0 ? rect.top : null);
  return sameLine ? rangeAfter(next as Element) : rangeBefore(next as Element);
}

function adjacentCalloutRange(
  node: Node,
  blocks: readonly HTMLElement[],
  direction: -1 | 1
): Range | null {
  const element =
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const block = element?.closest<HTMLElement>('.markdown-block') ?? null;
  const current = block === null ? -1 : blocks.indexOf(block);
  if (current < 0) {
    return null;
  }
  const neighbor = blocks[current + direction];
  if (!neighbor) {
    return null;
  }

  const edge =
    direction < 0
      ? lastNavigableNodeIn(neighbor)
      : firstNavigableNodeIn(neighbor);
  const body = edge?.parentElement?.closest<HTMLElement>('.markdown-callout-body') ?? null;
  if (!body) {
    return null;
  }

  const anchor = body.querySelector<HTMLElement>(`[data-${CALLOUT_BODY_ANCHOR}]`);
  const text = anchor
    ? firstTextNodeIn(anchor)
    : direction < 0
      ? lastTextNodeIn(body)
      : firstTextNodeIn(body);
  if (!text) {
    return null;
  }
  return collapsed(text, direction < 0 ? text.data.length : 0);
}
