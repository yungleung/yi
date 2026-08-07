/**
 * mdast-util-to-markdown extension serializing `wikilink` nodes back to their
 * exact source (`[[filename]]` or `[[filename|title]]`).
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
