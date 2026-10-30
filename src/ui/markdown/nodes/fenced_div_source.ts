/**
 * Shows an unknown Pandoc fenced Div as its complete source.
 *
 * Yi has no rendering for column, speaker-note, wrapper or incremental Divs, so
 * their exact Markdown remains visible whether or not the caret is inside them.
 *
 * May import: the node contract, block model and block-relative offset tags.
 * Upholds: the element holds every source character from block offset zero.
 */

import type { AstNode } from '../ast';
import type { BlockNode } from '../document/blocks';
import { TEXT_FROM, setOffset } from '../offset_tags';
import { EditableNodeComponent } from './editable_node';

export class FencedDivSourceView extends EditableNodeComponent {
  constructor(block: BlockNode) {
    super(
      'fencedDivSource',
      block as unknown as AstNode,
      document.createElement('pre'),
      'markdown-fenced-div-source markdown-source-text overflow-x-auto'
    );
    setOffset(this.element, TEXT_FROM, 0);
    this.element.textContent = block.text;
  }
}
