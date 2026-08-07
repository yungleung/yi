/**
 * mdast-util-to-markdown extension serializing `citation` nodes back to their
 * exact source (`@key` or `[@key]`).
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
