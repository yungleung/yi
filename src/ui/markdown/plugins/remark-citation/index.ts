/**
 * remark plugin: pandoc-style citations.
 *
 * Parses bracketed pandoc citations such as `[@smith2020]`, `[-@smith2020, p. 45]`
 * or `[see @smith2020; also @jones2019, ch. 3]` into `citation` mdast nodes.
 * The raw source (the text between the brackets) is kept on the node so the
 * serializer can round-trip it exactly, and so the editor can reveal it.
 *
 * The syntax is implemented as a micromark text construct, which keeps the
 * bracket content literal (no emphasis/links inside) and correctly skips
 * escaped brackets (`\[@x\]`) and image/link syntax.
 *
 * May import: the plugin API and its own three pieces (`./syntax`,
 * `./from-markdown`, `./to-markdown`). Upholds: the construct is added to the
 * parser in one place, so parsing and serializing cite the same rule.
 */
import type { Processor } from 'unified';
import { citationFromMarkdown } from './from-markdown';
import { citationSyntax } from './syntax';
import { citationToMarkdown } from './to-markdown';

export interface CitationNode {
  type: 'citation';
  /** Raw markdown source of the citation: `@smith2020` (narrative) or `[@smith2020, p. 45]` (parenthetical). */
  value: string;
}

/**
 * Remark plugin wiring the micromark syntax extension and the mdast-util
 * from/to-markdown extensions into a unified processor.
 */
export function remarkCitation(this: Processor): void {
  const data = this.data() as unknown as {
    micromarkExtensions?: unknown[];
    fromMarkdownExtensions?: unknown[];
    toMarkdownExtensions?: unknown[];
  };

  (data.micromarkExtensions ??= []).push(citationSyntax());
  (data.fromMarkdownExtensions ??= []).push(citationFromMarkdown());
  (data.toMarkdownExtensions ??= []).push(citationToMarkdown());
}

export { citationToMarkdown };
