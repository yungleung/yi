/**
 * Turns attributed fenced code blocks into Yi's block-level listing nodes.
 *
 * Only a parsed explicit ID or non-empty caption qualifies. The source spelling
 * is retained so source mode and serialization never normalize it.
 *
 * May import: mdast types and the code-fence attribute rule. Upholds: one fence
 * produces one block node and ordinary code remains untouched.
 */

import type { Code, Root, RootContent } from 'mdast';
import { listingFenceData, type CodeFenceData } from './fences';

/** A fenced code block with a listing ID, caption, or both. */
export type ListingNode = Omit<Code, 'type'> & CodeFenceData & {
  type: 'listing';
  source: string;
};

/** Replace every root-level qualifying code fence. */
export function restoreListings(tree: Root, markdown: string): void {
  for (let index = 0; index < tree.children.length; index += 1) {
    const child = tree.children[index];
    if (child.type !== 'code') {
      continue;
    }
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;
    if (start === undefined || end === undefined) {
      continue;
    }
    const source = markdown.slice(start, end);
    const data = listingFenceData(source);
    if (data === null) {
      continue;
    }
    tree.children[index] = {
      ...child,
      type: 'listing',
      source,
      ...data
    } as RootContent;
  }
}
