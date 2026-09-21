/**
 * Renders a `paragraph` node.
 *
 * May import: the node contract (`editable_node.ts`), the registry's child helper
 * and the AST types. Upholds: a block's rendering is a pure function of its own
 * source — the element holds the node's children and nothing else.
 */

import { appendChildren } from '../registry';
import { EditableNodeComponent } from './editable_node';
import type { AstParagraph } from '../ast';

export class Paragraph extends EditableNodeComponent {
  constructor(node: AstParagraph) {
    super('paragraph', node, document.createElement('p'), 'min-w-0');
    appendChildren(this.element, node.children);
  }
}
