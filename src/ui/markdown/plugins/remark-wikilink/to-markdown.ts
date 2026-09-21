/**
 * mdast-util-to-markdown extension serializing `wikilink` nodes back to their
 * exact source (`[[filename]]` or `[[filename|title]]`).
 *
 * May import: the mdast-util extension API. Upholds: a node serializes back to
 * exactly the source it was parsed from, so the link a reader sees and the text
 * on disk cannot drift apart.
 */
import type { Options } from 'mdast-util-to-markdown';

export function wikilinkToMarkdown(): Options {
  return {
    handlers: {
      wikilink(node: any): string {
        return node.value;
      }
    }
  } as unknown as Options;
}
