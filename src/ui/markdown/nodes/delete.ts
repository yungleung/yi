import { appendChildren } from './create_node';
import { EditableNodeComponent, type MarkdownDelete } from './editable_node';

/** Renders a `delete` (strikethrough) node. */
export class Delete extends EditableNodeComponent {
  constructor(node: MarkdownDelete) {
    super('delete', node, document.createElement('del'));
    appendChildren(this.element, node.children);
  }
}
