/**
 * remark plugin: wikilinks.
 *
 * Parses `[[filename]]` and `[[filename|title]]` into `wikilink` mdast nodes.
 * The raw source is kept on the node so the serializer round-trips it exactly
 * and the editor can reveal it on click.
 *
 * The syntax is a micromark text construct, which keeps the bracket content
 * literal and correctly skips escaped brackets, images, and link labels.
 */
import type { Processor } from 'unified';
import { wikilinkFromMarkdown } from './from-markdown';
import { wikilinkSyntax } from './syntax';
import { wikilinkToMarkdown } from './to-markdown';

export interface WikilinkNode {
  type: 'wikilink';
  /** Raw markdown source: `[[filename]]` or `[[filename|title]]`. */
  value: string;
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
