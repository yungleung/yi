/**
 * A quote's complete source while it contains source-only child lines.
 *
 * Empty quoted paragraphs and fenced code/equation children have no complete
 * rendered text surface for the caret. This view keeps every document
 * character and newline addressable until the caret leaves the quote.
 *
 * May import: the editable-node contract and offset tags. Upholds: the source
 * is the block's own text, one character for one document offset.
 */

import type { AstNode } from '../ast';
import type { BlockNode } from '../document/blocks';
import { TEXT_FROM, setOffset } from '../offset_tags';
import { EditableNodeComponent } from './editable_node';

export class QuoteSourceView extends EditableNodeComponent {
  constructor(block: BlockNode) {
    super(
      'quoteSource',
      block as unknown as AstNode,
      document.createElement('pre'),
      'markdown-quote-source markdown-source-text overflow-x-auto'
    );
    setOffset(this.element, TEXT_FROM, 0);
    this.element.textContent = block.text;
  }
}
