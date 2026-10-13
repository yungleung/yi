/**
 * remark plugin: wikilinks.
 *
 * Parses `[[filename]]` and `[[filename|title]]` into `wikilink` mdast nodes.
 * The raw source is kept on the node so the serializer round-trips it exactly
 * and the editor can reveal it on click.
 *
 * The syntax is a micromark text construct, which keeps the bracket content
 * literal and correctly skips escaped brackets, images, and link labels.
 *
 * May import: the plugin API and its own three pieces (`./syntax`,
 * `./from-markdown`, `./to-markdown`). Upholds: the construct is added to the
 * parser in one place, so parsing and serializing cite the same rule.
 */
import type { Processor } from 'unified';
import type { Position } from 'unist';
import { wikilinkFromMarkdown } from './from-markdown';
import { wikilinkSyntax } from './syntax';
import { wikilinkToMarkdown } from './to-markdown';

export interface WikilinkNode {
  type: 'wikilink';
  /** Raw markdown source: `[[filename]]` or `[[filename|title]]`. */
  value: string;
  /**
   * Where it stands in the text it was parsed from, which mdast sets on every node built from a
   * token. The editor never needs it — a node is drawn where the renderer put it — but a reader
   * that rewrites the *text* does: an export writes the link's own words into the span this names
   * (`ui/export/preprocess.ts`).
   */
  position?: Position;
}

/**
 * Remark plugin wiring the micromark syntax extension and the mdast-util
 * from/to-markdown extensions into a unified processor.
 */
export function remarkWikilink(this: Processor): void {
  const data = this.data() as unknown as {
    micromarkExtensions?: unknown[];
    fromMarkdownExtensions?: unknown[];
    toMarkdownExtensions?: unknown[];
  };

  (data.micromarkExtensions ??= []).push(wikilinkSyntax());
  (data.fromMarkdownExtensions ??= []).push(wikilinkFromMarkdown());
  (data.toMarkdownExtensions ??= []).push(wikilinkToMarkdown());
}
