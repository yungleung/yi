import { appendChildren } from '../registry';
import { EditableNodeComponent, tagRawRange } from './editable_node';
import type { AstDelete } from '../ast';

/** Renders a `delete` (strikethrough) node. */
export class Delete extends EditableNodeComponent {
  constructor(node: AstDelete) {
    super('delete', node, document.createElement('del'));
    tagRawRange(this.element, node);
    appendChildren(this.element, node.children);
  }
}
