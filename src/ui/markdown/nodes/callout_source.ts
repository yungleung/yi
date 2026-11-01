/**
 * Shows a callout's complete source while the caret is inside the block.
 *
 * May import: the node contract, the block model and block-relative offset
 * tags. Upholds: the element's text is exactly the document source, one
 * character for one character, starting at block-relative offset zero.
 */

import type { AstNode } from '../ast';
import type { BlockNode } from '../document/block';
import { TEXT_FROM, setOffset } from '../offset_tags';
import { EditableNodeComponent } from './editable_node';

export class CalloutSourceView extends EditableNodeComponent {
  constructor(block: BlockNode) {
    super(
      'calloutSource',
      block as unknown as AstNode,
      document.createElement('pre'),
      'markdown-callout-source markdown-source-text overflow-x-auto'
    );
    setOffset(this.element, TEXT_FROM, 0);
    this.element.textContent = block.text;
  }
}
