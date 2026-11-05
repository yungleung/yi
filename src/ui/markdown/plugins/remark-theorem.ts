/**
 * Restores theorem container directives into one semantic theorem node.
 *
 * Example: the prepared `:::theorem` node becomes `{ type: 'theorem' }` only
 * when the original source at that position is a complete declared theorem.
 *
 * May import: the theorem reader and mdast types. Upholds: the node keeps the
 * original document position and the complete authored source range.
 */

import type { Parent, Root, RootContent } from 'mdast';
import type { VFile } from 'vfile';
import {
  readTheorem,
  type TheoremSource
} from '../syntax/theorem';
import type { TheoremVocabulary } from '../syntax/theorem';

/** A theorem normalized from a fenced Div. */
export interface TheoremNode extends Parent {
  type: 'theorem';
  theorem: TheoremSource;
  children: RootContent[];
}

/** The remark transformer that restores declared theorem directives. */
export function remarkTheorems() {
  return (tree: Root, file: VFile): void => {
    const markdown =
      typeof file.data.calloutSource === 'string'
        ? file.data.calloutSource
        : String(file);
    const vocabulary = file.data.theoremVocabulary as TheoremVocabulary;
    visit(tree.children, markdown, vocabulary);
  };
}

function visit(
  children: RootContent[],
  markdown: string,
  vocabulary: TheoremVocabulary
): void {
  for (let index = 0; index < children.length; index += 1) {
    const node = children[index] as RootContent & {
      type: string;
      name?: string;
      children?: RootContent[];
      position?: { start?: { offset?: number }; end?: { offset?: number } };
    };
    const start = node.position?.start?.offset;
    if (
      node.type === 'containerDirective' &&
      node.name === 'thm' &&
      start !== undefined
    ) {
      const theorem = readTheorem(markdown.slice(start), vocabulary);
      if (
        theorem !== null &&
        node.position?.end?.offset === start + theorem.to
      ) {
        const restored: TheoremNode = {
          type: 'theorem',
          theorem: {
            ...theorem,
            from: theorem.from + start,
            to: theorem.to + start,
            markerFrom: theorem.markerFrom + start,
            markerTo: theorem.markerTo + start,
            bodyFrom: theorem.bodyFrom + start,
            bodyTo: theorem.bodyTo + start,
            source: markdown.slice(start, start + theorem.to)
          },
          children: [...(node.children ?? [])],
          position: node.position
        };
        children[index] = restored;
        visit(restored.children, markdown, vocabulary);
        continue;
      }
    }
    if (Array.isArray(node.children)) {
      visit(node.children, markdown, vocabulary);
    }
  }
}
