import { appendChildren } from '../registry';
import { EditableNodeComponent } from './editable_node';
import type { AstDelete } from '../ast';

/** Renders a `delete` (strikethrough) node. */
export class Delete extends EditableNodeComponent {
  constructor(node: AstDelete) {
    super('delete', node, document.createElement('del'));
    appendChildren(this.element, node.children);
  }
}
