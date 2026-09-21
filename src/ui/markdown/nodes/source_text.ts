/**
 * A block rendered as its own text, exactly as the document has it.
 *
 * This is what a block shows instead of its view while the caret is inside it
 * (see `source_mode.ts`): the element holds the block's characters, so a click is
 * a click on a character, a drag selects what it covers and typing is an ordinary
 * text edit — the shape a fenced code block has at all times.
 *
 * May import: the node contract (`editable_node.ts`), the LaTeX highlighter and
 * the block model's types. Upholds: the text is tagged with the block-relative
 * offset it starts at — zero, because it *is* the block's text — so a caret inside
 * it maps back to the document exactly (`caret/offsets.ts`), and the highlighting
 * never changes a character of it.
 */

import { EditableNodeComponent } from './editable_node';
import { highlightLatex } from './latex_highlight';
import type { AstNode } from '../ast';
import type { BlockNode } from '../blocks';

export class SourceText extends EditableNodeComponent {
  constructor(node: BlockNode) {
    // The block tree's nodes are mdast-like (see `blocks.ts`), and this
    // component renders one of them rather than a node of the parsed tree.
    super(
      'sourceText',
      node as unknown as AstNode,
      document.createElement('pre'),
      'markdown-source-text my-4 overflow-x-auto'
    );
    this.element.dataset.textFrom = '0';
    this.element.innerHTML = highlightLatex(node.text);
  }
}
