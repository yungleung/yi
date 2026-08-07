import { appendChildren } from '../create_node';
import { EditableNodeComponent } from './editable_node';
import type { AstBlockquote } from '../ast';

/** Renders a `blockquote` node. */
export class Blockquote extends EditableNodeComponent {
  constructor(node: AstBlockquote) {
    super('blockquote', node, document.createElement('blockquote'), 'min-w-0');
    appendChildren(this.element, node.children);
  }
}
