/**
 * mdast-util-to-markdown extension serializing `citation` nodes back to their
 * exact source (`@key` or `[@key]`).
 *
 * May import: the mdast-util extension API. Upholds: a node serializes back to
 * exactly the source it was parsed from — through a hand edit of the raw text,
 * the citation a reader sees and the text on disk cannot drift apart.
 */
import type { Options } from 'mdast-util-to-markdown';

export function citationToMarkdown(): Options {
  return {
    handlers: {
      citation(node: any, _parent: any, _state: any, _info: any): string {
        return node.value;
      }
    }
  } as unknown as Options;
}
