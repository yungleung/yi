/**
 * Classifies the quote child construct at a document offset.
 *
 * Example: an offset inside a block quote's table reports `child: 'table'`, which lets the editing
 * rule choose the construct it is actually inside rather than treating every quote line alike.
 *
 * May import: document state/blocks, quote prefix rules and mdast node types. Upholds: the deepest
 * construct containing the offset wins, and the end immediately after a completed child says so.
 */

import type { RootContent } from 'mdast';
import type { MarkdownBlock } from '../document/block';
import type { MarkdownEditorState } from '../document/state';
import {
  quotePrefixAt,
  type QuoteChildContext
} from '../syntax/container';

/** The active quote depth and child construct at a document offset. */
export function quoteContextAt(
  state: MarkdownEditorState,
  block: MarkdownBlock,
  offset: number
): { depth: number; child: QuoteChildContext; prefix: string } | null {
  const relative = Math.min(Math.max(0, offset - block.charStart), block.text.length);
  const line = quotePrefixAt(block.text, relative);
  if (line === null) {
    return null;
  }

  let child: QuoteChildContext = 'paragraph';
  let ownerEnd: number | null = null;
  const visit = (nodes: readonly RootContent[]): void => {
    for (const node of nodes) {
      const position = (node as {
        position?: { start?: { offset?: number }; end?: { offset?: number } };
      }).position;
      const start = position?.start?.offset;
      const end = position?.end?.offset;
      if (start === undefined || end === undefined || relative < start || relative > end) {
        continue;
      }
      if (node.type === 'code') {
        child = 'code';
        ownerEnd = end;
      } else if (node.type === 'math') {
        child = 'equation';
        ownerEnd = end;
      } else if (node.type === 'table') {
        child = 'table';
        ownerEnd = end;
      } else if (node.type === 'listItem') {
        child = 'list';
        ownerEnd = null;
      }
      const children = (node as { children?: RootContent[] }).children;
      if (Array.isArray(children)) {
        visit(children);
      }
    }
  };
  visit(state.getBlockContent(block));

  if (ownerEnd !== null && relative === ownerEnd) {
    child = 'completed-child';
  }
  return { ...line, child };
}
